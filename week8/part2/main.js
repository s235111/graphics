import { flatten, mat4, perspective, sizeof } from "../../MV.js";

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

// Make a simple plane with texture coordinates
const model = {
	vertices: new Float32Array([
		-2, -1, -1, 2, -1, -1, -2, -1, -5, 2, -1, -5,
		0.25, -0.5, -1.25, 0.75, -0.5, -1.25, 0.25, -0.5, -1.75, 0.75, -0.5, -1.75,
		-1, -1, -2.5, -1, -1, -3, -1, 0, -2.5, -1, 0, -3,
	]),
	texcoords: new Float32Array([
		0, 1, 1, 1, 0, 0, 1, 0,
		0, 1, 1, 1, 0, 0, 1, 0,
		0, 1, 1, 1, 0, 0, 1, 0,
	]),
	indices: new Uint16Array([
		0, 1, 2, 2, 1, 3,
		4, 5, 6, 6, 5, 7,
	]),
};

// Create the position buffer and describe its layout
const positionBuffer = device.createBuffer({
	size: model.vertices.byteLength,
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

// Create the texture coordinate buffer and describe its layout
const texcoordBuffer = device.createBuffer({
	size: model.texcoords.byteLength,
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const texcoordBufferLayout = {
	arrayStride: sizeof["vec2"],
	attributes: [{
		format: "float32x2",
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
device.queue.writeBuffer(texcoordBuffer, 0, model.texcoords);
device.queue.writeBuffer(indexBuffer, 0, model.indices);

// Create a single pixel red texture and write it to the GPU
const redTexture = device.createTexture({
	size: [1, 1],
	format: "rgba8unorm",
	usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
device.queue.writeTexture({ texture: redTexture }, new Uint8Array([255, 0, 0, 255]), { bytesPerRow: 4 }, [1, 1]);

// Read the ground texture and write it to the GPU
const groundImg = await fetch("../../textures/xamp23.png").then(_ => _.blob()).then(createImageBitmap);
const groundTexture = device.createTexture({
	size: groundImg,
	format: "rgba8unorm",
	usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
});
device.queue.copyExternalImageToTexture({ source: groundImg }, { texture: groundTexture }, groundImg);

// Create a sampler for the textures
const sampler = device.createSampler({
	magFilter: "linear",
	minFilter: "linear",
});

// Create the render pipeline
const pipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module, entryPoint: "main_vs", buffers: [positionBufferLayout, texcoordBufferLayout] },
	fragment: { module, entryPoint: "main_fs", targets: [{ format }] },
	depthStencil: { depthWriteEnabled: true, depthCompare: "always", format: "depth24plus" },
	primitive: { topology: "triangle-list", cullMode: "none" },
});

// Create the projection and view matrices
const projection = perspective(90, canvas.width / canvas.height, 0.1, 30);
// Convert the OpenGL-style projection matrix from MV.js to WebGPU-style
// This is equivalent to using the Mst as mentioned in the slides
for (let i = 0; i < 4; i++) projection[2][i] = (projection[2][i] + projection[3][i]) * 0.5;
const view = mat4();

// Create the uniform buffer
const uniformBuffer = device.createBuffer({
	size: 3 * sizeof["mat4"] + sizeof["vec4"],
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
// The model matrix is just the identity matrix in this case
device.queue.writeBuffer(uniformBuffer, 0, flatten(mat4()));
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"], flatten(view));
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"] * 2, flatten(projection));
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"] * 3, new Float32Array([1]));

// Create the shadow uniform buffer
const shadowUniformBuffer = device.createBuffer({
	size: 3 * sizeof["mat4"] + sizeof["vec4"],
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
// The shadow model matrix gets written with update() further down
device.queue.writeBuffer(shadowUniformBuffer, sizeof["mat4"], flatten(view));
device.queue.writeBuffer(shadowUniformBuffer, sizeof["mat4"] * 2, flatten(projection));
device.queue.writeBuffer(shadowUniformBuffer, sizeof["mat4"] * 3, new Float32Array([0]));

// Define the bind group for the uniforms, sampler, and ground texture
const groundBindGroup = device.createBindGroup({
	layout: pipeline.getBindGroupLayout(0),
	entries: [
		{ binding: 0, resource: uniformBuffer },
		{ binding: 1, resource: sampler },
		{ binding: 2, resource: groundTexture.createView() },
	],
});

// Define the bind group for the uniforms, sampler, and red texture
const redBindGroup = device.createBindGroup({
	layout: pipeline.getBindGroupLayout(0),
	entries: [
		{ binding: 0, resource: uniformBuffer },
		{ binding: 1, resource: sampler },
		{ binding: 2, resource: redTexture.createView() },
	],
});

// Define the bind group for drawing shadows
const shadowBindGroup = device.createBindGroup({
	layout: pipeline.getBindGroupLayout(0),
	entries: [
		{ binding: 0, resource: shadowUniformBuffer },
		{ binding: 1, resource: sampler },
		{ binding: 2, resource: redTexture.createView() },
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
	pass.setVertexBuffer(0, positionBuffer);
	pass.setVertexBuffer(1, texcoordBuffer);
	pass.setIndexBuffer(indexBuffer, "uint16");

	pass.setBindGroup(0, groundBindGroup);
	pass.drawIndexed(6);

	pass.setBindGroup(0, shadowBindGroup);
	pass.drawIndexed(6 * 2, 1, 0, 4);

	pass.setBindGroup(0, redBindGroup);
	pass.drawIndexed(6 * 2, 1, 0, 4);

	pass.end();
	device.queue.submit([encoder.finish()]);
}

// User inputs
document.getElementById("anim").addEventListener("click", e => {
	shouldAnimate = !shouldAnimate;
	e.target.textContent = shouldAnimate ? "Pause animation" : "Resume animation";
});

let rotation = 0;
const r = 2;
const ly = 2;
const rpm = 10;
function update(dt) {
	rotation += rpm / 60 * dt;
	const TAU = 2 * Math.PI;
	const lx = Math.sin(rotation * TAU) * r;
	const lz = Math.cos(rotation * TAU) * r - 2;
	// Calculate the shadow model matrix from the point light position
	// This is a simplified version of the full formula based on d = 1 and n = (0, 1, 0)
	device.queue.writeBuffer(shadowUniformBuffer, 0, new Float32Array([
		1 + ly, 0, 0, 0,
		-lx, 1, -lz, -1,
		0, 0, 1 + ly, 0,
		-lx, -ly, -lz, ly,
	]));
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
