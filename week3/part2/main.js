import { flatten, lookAt, mat4, mult, perspective, rotateX, rotateY, sizeof, translate } from "../../MV.js";

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

// Cube
//   5 ────── 6
//  /│       /│
// 1 ────── 2 │
// │ │      │ │
// │ 4 ─────│ 7
// │/       │/
// 0 ────── 3
const positions = new Float32Array([
	0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1,
	0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0,
]);
const wireIndices = new Uint16Array([
	0, 1, 1, 2, 2, 3, 3, 0, // Front
	2, 3, 3, 7, 7, 6, 6, 2, // Right
	0, 3, 3, 7, 7, 4, 4, 0, // Down
	1, 2, 2, 6, 6, 5, 5, 1, // Up
	4, 5, 5, 6, 6, 7, 7, 4, // Back
	0, 1, 1, 5, 5, 4, 4, 0, // Left
]);

// Create the position buffer and describe its layout
const positionBuffer = device.createBuffer({
	size: positions.byteLength,
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(positionBuffer, 0, positions);

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
	size: wireIndices.byteLength,
	usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(indexBuffer, 0, wireIndices);

// Create the render pipeline
const pipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module, entryPoint: "main_vs", buffers: [positionBufferLayout] },
	fragment: { module, entryPoint: "main_fs", targets: [{ format }] },
	primitive: { topology: "line-list" },
});

// Create the transformation matrices for view and projection
const Mst = mat4();
Mst[2][2] = 0.5, Mst[2][3] = 0.5;
const projection = perspective(45, canvas.width / canvas.height, 0.1, 10);
const view = lookAt([0, 0, 3], [0, 0, 0], [0, 1, 0]);
const vp = mult(Mst, mult(projection, view));

// Define the model matrices
const models = [];
models[0] = translate(-0.5, -0.5, -0.5);
models[1] = mult(rotateY(30), models[0]);
models[2] = mult(rotateX(-30), models[1]);

// Calculate the model-view-projection matrices for each cube
const mvps = new Float32Array(3 * 16);
for (const [i, m] of models.entries()) {
	// Translate the cube along the X-axis
	models[i][0][3] += 1.5 * (i - 1);
	// Multiply the view-projection matrix with the model matrix and collect the result into the Float32Array
	mvps.set(flatten(mult(vp, m)), i * 16);
}

// Create the uniform buffer
const uniformBuffer = device.createBuffer({
	size: 3 * sizeof["mat4"],
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, mvps);

const bindGroup = device.createBindGroup({
	layout: pipeline.getBindGroupLayout(0),
	entries: [{ binding: 0, resource: uniformBuffer }],
});

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
	});

	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.setVertexBuffer(0, positionBuffer);
	pass.setIndexBuffer(indexBuffer, "uint16");
	pass.drawIndexed(wireIndices.length, 3);

	pass.end();
	device.queue.submit([encoder.finish()]);
}

function animate(time) {
	render();
	requestAnimationFrame(animate);
}
animate();
