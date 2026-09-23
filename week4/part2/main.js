import { add, flatten, lookAt, mat4, mult, normalize, perspective, sizeof } from "../../MV.js";

// Initialise WebGPU and canvas
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format });

// Create the shader module
const wgslPath = document.querySelector("link[type=\"text/wgsl\"]").href;
const code = await fetch(wgslPath).then(_ => _.text());
const module = device.createShaderModule({ code });

// Sphere
const SQRT2ON3 = Math.SQRT2 / 3;
const SQRT6ON3 = SQRT2ON3 * Math.sqrt(3);
const BOTTOM = -1 / 3;
const positions = [
	[0, 0, 1],
	[0, 2 * SQRT2ON3, BOTTOM],
	[-SQRT6ON3, -SQRT2ON3, BOTTOM],
	[SQRT6ON3, -SQRT2ON3, BOTTOM],
];
let indices = new Uint16Array([
	0, 1, 2, 0, 3, 1, 1, 3, 2, 0, 2, 3,
]);

// Tetrahedron loop subdivision
//          i2
//         ╱  ╲
//        ╱    ╲
//       ╱      ╲
//     c20 ──── c12
//     ╱  ╲    ╱  ╲
//    ╱    ╲  ╱    ╲
//   ╱      ╲╱      ╲
// i0 ───── c01 ──── i1
// Using 16-bit indices limits the number of subdivisions to 7, which I think is fine
// With 7 subdivisions, all 65536 possible indices are used
const M = 7;
for (let i = 0; i < 4; i++) {
	indices = subdivideSphere(positions, indices);
}

function subdivideSphere(positions, indices) {
	const newIndices = new Uint16Array(indices.length * 4);
	const triangles = indices.length / 3;
	for (let i = 0, j = triangles; i < triangles; i++) {
		const [i0, i1, i2] = indices.slice(i * 3, (i + 1) * 3);
		const c01 = j++, c12 = j++, c20 = j++;
		if (j > positions.length) {
			positions.push(normalize(add(positions[i0], positions[i1])));
			positions.push(normalize(add(positions[i1], positions[i2])));
			positions.push(normalize(add(positions[i2], positions[i0])));
		}
		newIndices.set([i0, c01, c20, c20, c01, c12, c12, c01, i1, c20, c12, i2], i * 12);
	}
	return newIndices;
}

function unsubdivideSphere(indices) {
	const newIndices = new Uint16Array(indices.length / 4);
	const newTriangles = indices.length / 12;
	for (let i = 0; i < newTriangles; i++) {
		newIndices.set([indices[i * 12 + 0], indices[i * 12 + 8], indices[i * 12 + 11]], i * 3);
	}
	return newIndices;
}

function changeSubdivisions(increase) {
	const currentSubdivisions = Math.log2(indices.length / 3) / 2 - 1;
	if (increase ? currentSubdivisions >= M : currentSubdivisions <= 0) return;
	indices = increase ? subdivideSphere(positions, indices) : unsubdivideSphere(indices);
	updateMesh(positions, indices);
}

function updateMesh(positions, indices) {
	device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
	device.queue.writeBuffer(indexBuffer, 0, indices);
	document.getElementById("subdivisions").textContent = `${Math.log2(indices.length / 3) / 2 - 1} subdivision(s)`;
}

// Create the position buffer and describe its layout
const positionBuffer = device.createBuffer({
	size: sizeof["vec3"] * Math.pow(4, M + 1),
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const positionBufferLayout = {
	arrayStride: sizeof["vec3"],
	attributes: [{
		format: "float32x3",
		offset: 0,
		shaderLocation: 0,
	}],
};

// Create the index buffer
const indexBuffer = device.createBuffer({
	size: Uint16Array.BYTES_PER_ELEMENT * 3 * Math.pow(4, M + 1),
	usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});

// Write to all the buffers
updateMesh(positions, indices);

// Create the render pipeline
const pipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module, entryPoint: "main_vs", buffers: [positionBufferLayout] },
	fragment: { module, entryPoint: "main_fs", targets: [{ format }] },
	depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus" },
	primitive: { topology: "triangle-list", cullMode: "back" },
});

// Create the transformation matrices for model, view, and projection
const Mst = mat4();
Mst[2][2] = 0.5, Mst[2][3] = 0.5;
const projection = perspective(45, canvas.width / canvas.height, 0.1, 10);
const view = lookAt([0, 0, 3], [0, 0, 0], [0, 1, 0]);
const mvp = flatten(mult(Mst, mult(projection, view)));

// Create the uniform buffer
const uniformBuffer = device.createBuffer({
	size: sizeof["mat4"],
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, mvp);

const bindGroup = device.createBindGroup({
	layout: pipeline.getBindGroupLayout(0),
	entries: [{ binding: 0, resource: uniformBuffer }],
});

// Create the depth texture
const depthTexture = device.createTexture({
	size: { width: canvas.width, height: canvas.height },
	format: "depth24plus",
	usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// User inputs
document.getElementById("inc").addEventListener("click", () => changeSubdivisions(true));
document.getElementById("dec").addEventListener("click", () => changeSubdivisions(false));

function render() {
	// Create a render pass and submit it through the command queue
	const encoder = device.createCommandEncoder();
	const pass = encoder.beginRenderPass({
		colorAttachments: [{
			view: ctx.getCurrentTexture().createView(),
			loadOp: "clear",
			storeOp: "store",
			clearValue: { r: 0.3921, g: 0.5843, b: 0.9294, a: 1.0 },
		}],
		depthStencilAttachment: {
			view: depthTexture.createView(),
			depthLoadOp: "clear",
			depthStoreOp: "store",
			depthClearValue: 1.0,
		},
	});

	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.setVertexBuffer(0, positionBuffer);
	pass.setIndexBuffer(indexBuffer, "uint16");
	pass.drawIndexed(indices.length);

	pass.end();
	device.queue.submit([encoder.finish()]);
}

function animate(time) {
	render();
	requestAnimationFrame(animate);
}
animate();
