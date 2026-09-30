import { flatten, lookAt, mat4, mult, perspective, sizeof } from "../../MV.js";
import { readOBJFile } from "../../OBJParser.js";

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

// Load the 3D model
const model = await readOBJFile("../../utah_teapot.obj", 1, false, false);

// Create the position buffer and describe its layout
const positionBuffer = device.createBuffer({
	size: model.vertices.byteLength,
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const positionBufferLayout = {
	arrayStride: sizeof["vec4"],
	attributes: [{
		format: "float32x4",
		offset: 0,
		shaderLocation: 0,
	}],
};

// Create the normal buffer and describe its layout
const normalBuffer = device.createBuffer({
	size: model.normals.byteLength,
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

// Create the index buffer
const indexBuffer = device.createBuffer({
	size: model.indices.byteLength,
	usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});

// Write to all the buffers
device.queue.writeBuffer(positionBuffer, 0, model.vertices);
device.queue.writeBuffer(normalBuffer, 0, model.normals);
device.queue.writeBuffer(indexBuffer, 0, model.indices);

// Create the render pipeline
const pipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module, entryPoint: "main_vs", buffers: [positionBufferLayout, normalBufferLayout] },
	fragment: { module, entryPoint: "main_fs", targets: [{ format }] },
	depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus" },
	primitive: { topology: "triangle-list", cullMode: "back" },
});

// Create the projection and view matrices
const Mst = mat4();
Mst[2][2] = 0.5, Mst[2][3] = 0.5;
const projection = perspective(45, canvas.width / canvas.height, 0.1, 12);
const view = lookAt([1, 3, 6], [0.25, 1.25, 0], [0, 1, 0]);

// Create the uniform buffer
const uniformBuffer = device.createBuffer({
	size: 3 * sizeof["mat4"] + 4 * sizeof["vec4"] + Float32Array.BYTES_PER_ELEMENT,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
// The model matrix is just the identity matrix in this case
device.queue.writeBuffer(uniformBuffer, 0, flatten(mat4()));
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"], flatten(view));
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"] * 2, flatten(mult(Mst, projection)));
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"] * 3, flatten([1, 3, 6]));

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
	pass.setVertexBuffer(1, normalBuffer);
	pass.setIndexBuffer(indexBuffer, "uint32");
	pass.drawIndexed(model.indices.length);

	pass.end();
	device.queue.submit([encoder.finish()]);
}

// User inputs
const sliders = [...document.querySelectorAll("#material input")];
for (const [i, slider] of sliders.entries()) {
	const offset = 3 * sizeof["mat4"] + sizeof["vec4"] + i * Float32Array.BYTES_PER_ELEMENT;
	if (slider.id === "s") {
		slider.addEventListener("input", () => device.queue.writeBuffer(uniformBuffer, offset, new Float32Array([Math.pow(10, slider.valueAsNumber)])));
	} else {
		slider.addEventListener("input", () => device.queue.writeBuffer(uniformBuffer, offset, new Float32Array([slider.valueAsNumber])));
	}
}
device.queue.writeBuffer(uniformBuffer, 3 * sizeof["mat4"] + sizeof["vec4"], new Float32Array(sliders.map(s => s.id === "s" ? Math.pow(10, s.valueAsNumber) : s.valueAsNumber)));

function animate() {
	render();
	requestAnimationFrame(animate);
}
animate();
