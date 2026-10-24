import { add, flatten, inverse, lookAt, mat4, mult, normalize, perspective, sizeof } from "../../MV.js";

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
for (let i = 0; i < 5; i++) {
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
	// Offsets because of the background quad
	device.queue.writeBuffer(positionBuffer, 48, flatten(positions));
	device.queue.writeBuffer(normalBuffer, 64, flatten(positions.map(([x, y, z]) => [x, y, z, 0])));
	device.queue.writeBuffer(indexBuffer, 12, indices);
	document.getElementById("subdivisions").textContent = `${Math.log2(indices.length / 3) / 2 - 1} subdivision(s)`;
}

// Create the position buffer and describe its layout (with extra space for the background quad)
const positionBuffer = device.createBuffer({
	size: sizeof["vec3"] * (4 + Math.pow(4, M + 1)),
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

// Create the normal buffer and describe its layout (with extra space for the background quad)
const normalBuffer = device.createBuffer({
	size: sizeof["vec4"] * (4 + Math.pow(4, M + 1)),
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const normalBufferLayout = {
	arrayStride: sizeof["vec4"],
	attributes: [{
		format: "float32x4",
		offset: 0,
		shaderLocation: 1,
	}],
};

// Create the index buffer (with extra space for the background quad)
const indexBuffer = device.createBuffer({
	size: Uint16Array.BYTES_PER_ELEMENT * 3 * (2 + Math.pow(4, M + 1)),
	usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});

// Write to all the buffers
updateMesh(positions, indices);

// Also write the background quad values
device.queue.writeBuffer(positionBuffer, 0, new Float32Array([-1, -1, 0.999, 1, -1, 0.999, -1, 1, 0.999, 1, 1, 0.999]));
device.queue.writeBuffer(normalBuffer, 0, new Float32Array([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]));
device.queue.writeBuffer(indexBuffer, 0, new Uint16Array([0, 1, 2, 2, 1, 3]));

// Read the cubemap textures and write them to the GPU
const cubemap = "../../textures/cm";
const cubemapSideNames = ["left", "right", "top", "bottom", "back", "front"];
const cubemapSides = await Promise.all(cubemapSideNames.map(side => fetch(`${cubemap}_${side}.png`).then(res => res.blob()).then(createImageBitmap)));
const texture = device.createTexture({
	size: [cubemapSides[0].width, cubemapSides[0].height, 6],
	format: "rgba8unorm",
	usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
});
for (const [i, img] of cubemapSides.entries()) {
	device.queue.copyExternalImageToTexture({ source: img, flipY: true }, { texture, origin: [0, 0, i] }, img);
}

// Create a sampler for the cubemap
const sampler = device.createSampler({
	magFilter: "linear",
	minFilter: "linear",
});

// Create the render pipeline
const pipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module, entryPoint: "main_vs", buffers: [positionBufferLayout, normalBufferLayout] },
	fragment: { module, entryPoint: "main_fs", targets: [{ format }] },
	depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus" },
	primitive: { topology: "triangle-list", cullMode: "back" },
});

// Create the projection matrix
const projection = perspective(90, canvas.width / canvas.height, 0.1, 10);
// Convert the OpenGL-style projection matrix from MV.js to WebGPU-style
// This is equivalent to using the Mst as mentioned in the slides
for (let i = 0; i < 4; i++) projection[2][i] = (projection[2][i] + projection[3][i]) * 0.5;
// Precalculate the inverse of the projection matrix used for calculating the texture matrix
const inverseProjection = inverse(projection);

// Create the uniform buffer
const uniformBuffer = device.createBuffer({
	size: 4 * sizeof["mat4"] + sizeof["vec4"] + Uint32Array.BYTES_PER_ELEMENT * 4,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
// The model matrix is just the identity matrix in this case
device.queue.writeBuffer(uniformBuffer, 0, flatten(mat4()));
// The view matrix and eye position get written with update() further down
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"] * 2, flatten(projection));
// The texture matrix is just the identity matrix here
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"] * 3, flatten(mat4()));
// The sphere is reflective
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"] * 4 + sizeof["vec4"], new Uint32Array([true]));

// Create the uniform buffer for the background quad
const backgroundUniformBuffer = device.createBuffer({
	size: 4 * sizeof["mat4"] + sizeof["vec4"] + Uint32Array.BYTES_PER_ELEMENT * 4,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
// The model, view, and projection matrices are just the identity matrix
device.queue.writeBuffer(backgroundUniformBuffer, 0, flatten(mat4()));
device.queue.writeBuffer(backgroundUniformBuffer, sizeof["mat4"], flatten(mat4()));
device.queue.writeBuffer(backgroundUniformBuffer, sizeof["mat4"] * 2, flatten(mat4()));
// The texture matrix for the background quad gets written with update() as well
// The eye position doesn't really matter here, so just set it to the origin
device.queue.writeBuffer(backgroundUniformBuffer, sizeof["mat4"] * 4, new Float32Array([0, 0, 0, 1]));
// The background is not reflective
device.queue.writeBuffer(backgroundUniformBuffer, sizeof["mat4"] * 4 + sizeof["vec4"], new Uint32Array([false]));

// Define the bind group for the uniforms, sampler, and texture
const bindGroup = device.createBindGroup({
	layout: pipeline.getBindGroupLayout(0),
	entries: [
		{ binding: 0, resource: uniformBuffer },
		{ binding: 1, resource: sampler },
		{ binding: 2, resource: texture.createView({ dimension: "cube" }) },
	],
});

// Define the bind group for background quad
const backgroundBindGroup = device.createBindGroup({
	layout: pipeline.getBindGroupLayout(0),
	entries: [
		{ binding: 0, resource: backgroundUniformBuffer },
		{ binding: 1, resource: sampler },
		{ binding: 2, resource: texture.createView({ dimension: "cube" }) },
	],
});

// Create the depth texture
const depthTexture = device.createTexture({
	size: canvas,
	format: "depth24plus",
	usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

function render() {
	// Create a render pass and submit it through the command queue
	const encoder = device.createCommandEncoder();
	const pass = encoder.beginRenderPass({
		colorAttachments: [{
			view: ctx.getCurrentTexture().createView(),
			loadOp: "clear",
			storeOp: "store",
			clearValue: { r: 0, g: 0, b: 0, a: 1 },
		}],
		depthStencilAttachment: {
			view: depthTexture.createView(),
			depthLoadOp: "clear",
			depthStoreOp: "store",
			depthClearValue: 1.0,
		},
	});

	pass.setPipeline(pipeline);
	pass.setVertexBuffer(0, positionBuffer);
	pass.setVertexBuffer(1, normalBuffer);
	pass.setIndexBuffer(indexBuffer, "uint16");

	pass.setBindGroup(0, backgroundBindGroup);
	pass.drawIndexed(6);

	pass.setBindGroup(0, bindGroup);
	pass.drawIndexed(indices.length, 1, 6, 4);

	pass.end();
	device.queue.submit([encoder.finish()]);
}

// User inputs
document.getElementById("inc").addEventListener("click", () => changeSubdivisions(true));
document.getElementById("dec").addEventListener("click", () => changeSubdivisions(false));
document.getElementById("anim").addEventListener("click", e => {
	shouldAnimate = !shouldAnimate;
	e.target.textContent = shouldAnimate ? "Pause animation" : "Resume animation";
});

let rotation = 0;
const r = 2;
const rpm = 5;
function update(dt) {
	rotation += rpm / 60 * dt;
	const TAU = 2 * Math.PI;
	const pos = [Math.sin(rotation * TAU) * r, 0, Math.cos(rotation * TAU) * r];
	const view = lookAt(pos, [0, 0, 0], [0, 1, 0]);
	device.queue.writeBuffer(uniformBuffer, sizeof["mat4"], flatten(view));
	device.queue.writeBuffer(uniformBuffer, 4 * sizeof["mat4"], new Float32Array([...pos, 1]));
	// Calculate the texture matrix for the backgroud quad
	const inverseView = inverse(view);
	for (let i = 0; i < 4; i++) inverseView[i][3] = inverseView[3][i] = 0;
	const textureMatrix = mult(inverseView, inverseProjection);
	device.queue.writeBuffer(backgroundUniformBuffer, 3 * sizeof["mat4"], flatten(textureMatrix));
}

let shouldAnimate = true;
let lastTime = 0;
function animate(time) {
	if (shouldAnimate) update((time - lastTime) / 1000);
	lastTime = time;
	render();
	requestAnimationFrame(animate);
}
animate(0);
