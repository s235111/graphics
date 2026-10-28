import { flatten, mat4, mult, perspective, sizeof, translate } from "../../MV.js";
import { readOBJFile } from "../../OBJParser.js";

// Initialise WebGPU and canvas
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format });

// Create the shader module
const wgslLinks = [...document.querySelectorAll("link[type=\"text/wgsl\"]")];
const [groundCode, teapotCode] = await Promise.all(wgslLinks.map(link => fetch(link.href).then(_ => _.text())));
const module = device.createShaderModule({ code: groundCode });
const teapotModule = device.createShaderModule({ code: teapotCode });

// Make a simple plane with texture coordinates
const ground = {
	vertices: new Float32Array([-2, -1, -1, 1, 2, -1, -1, 1, -2, -1, -5, 1, 2, -1, -5, 1]),
	normals: new Float32Array([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]),
	texcoords: new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
	indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
};

// Load the 3D model
const teapot = await readOBJFile("../../utah_teapot.obj", 0.25, false, false);
const teapotModel = translate(0, -1, -2);

// Create the position buffer and describe its layout
const positionBuffer = device.createBuffer({
	size: ground.vertices.byteLength + teapot.vertices.byteLength,
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

// Create the texture coordinate buffer and describe its layout
const texcoordBuffer = device.createBuffer({
	size: ground.texcoords.byteLength,
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

// Create the normal buffer and describe its layout
const normalBuffer = device.createBuffer({
	size: ground.normals.byteLength + teapot.normals.byteLength,
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
	size: ground.indices.byteLength + teapot.indices.byteLength,
	usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});

// Write to all the buffers
device.queue.writeBuffer(positionBuffer, 0, ground.vertices);
device.queue.writeBuffer(positionBuffer, ground.vertices.byteLength, teapot.vertices);
device.queue.writeBuffer(texcoordBuffer, 0, ground.texcoords);
device.queue.writeBuffer(normalBuffer, 0, ground.normals);
device.queue.writeBuffer(normalBuffer, ground.normals.byteLength, teapot.normals);
device.queue.writeBuffer(indexBuffer, 0, ground.indices);
device.queue.writeBuffer(indexBuffer, ground.indices.byteLength, teapot.indices);

// Read the ground texture and write it to the GPU
const groundImg = await fetch("../../textures/xamp23.png").then(_ => _.blob()).then(createImageBitmap);
const groundTexture = device.createTexture({
	size: groundImg,
	format: "rgba8unorm",
	usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
});
device.queue.copyExternalImageToTexture({ source: groundImg }, { texture: groundTexture }, groundImg);

// Create a sampler for the texture
const sampler = device.createSampler({
	magFilter: "linear",
	minFilter: "linear",
});

// Create the render pipeline for the ground
const groundPipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module: module, entryPoint: "main_vs", buffers: [positionBufferLayout, texcoordBufferLayout] },
	fragment: { module: module, entryPoint: "main_fs", targets: [{ format }] },
	depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus-stencil8", stencilFront: { passOp: "replace" } },
	primitive: { topology: "triangle-list", cullMode: "back" },
});

// Create the render pipeline for the teapot
const teapotPipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module: teapotModule, entryPoint: "main_vs", buffers: [positionBufferLayout, normalBufferLayout] },
	fragment: { module: teapotModule, entryPoint: "main_fs", targets: [{ format }] },
	depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus-stencil8" },
	primitive: { topology: "triangle-list", cullMode: "back" },
});

// Create the render pipeline for drawing shadows
const shadowPipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module: module, entryPoint: "main_vs", buffers: [positionBufferLayout, texcoordBufferLayout] },
	fragment: { module: module, entryPoint: "main_fs", targets: [{ format, blend: { color: { srcFactor: "constant", dstFactor: "one-minus-constant" }, alpha: {} } }] },
	depthStencil: { depthWriteEnabled: true, depthCompare: "always", format: "depth24plus-stencil8", stencilFront: { compare: "equal", passOp: "zero" } },
	primitive: { topology: "triangle-list", cullMode: "back" },
});

// Create the projection and view matrices
const projection = perspective(90, canvas.width / canvas.height, 0.1, 30);
// Convert the OpenGL-style projection matrix from MV.js to WebGPU-style
// This is equivalent to using the Mst as mentioned in the slides
for (let i = 0; i < 4; i++) projection[2][i] = (projection[2][i] + projection[3][i]) * 0.5;
const view = mat4();

// Create the uniform buffer for the ground
const groundUniformBuffer = device.createBuffer({
	size: 3 * sizeof["mat4"] + sizeof["vec4"],
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
// The model matrix is just the identity matrix in this case
device.queue.writeBuffer(groundUniformBuffer, 0, flatten(mat4()));
device.queue.writeBuffer(groundUniformBuffer, sizeof["mat4"], flatten(view));
device.queue.writeBuffer(groundUniformBuffer, sizeof["mat4"] * 2, flatten(projection));
device.queue.writeBuffer(groundUniformBuffer, sizeof["mat4"] * 3, new Float32Array([1]));

// Create the uniform buffer for the teapot
const teapotUniformBuffer = device.createBuffer({
	size: 3 * sizeof["mat4"] + 2 * sizeof["vec4"],
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(teapotUniformBuffer, 0, flatten(teapotModel));
device.queue.writeBuffer(teapotUniformBuffer, sizeof["mat4"], flatten(view));
device.queue.writeBuffer(teapotUniformBuffer, sizeof["mat4"] * 2, flatten(projection));
device.queue.writeBuffer(teapotUniformBuffer, sizeof["mat4"] * 3, flatten([0, 0, 0, 1]));

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
	layout: groundPipeline.getBindGroupLayout(0),
	entries: [
		{ binding: 0, resource: groundUniformBuffer },
		{ binding: 1, resource: sampler },
		{ binding: 2, resource: groundTexture.createView() },
	],
});

// Define the bind group for the uniforms for the teapot
const teapotBindGroup = device.createBindGroup({
	layout: teapotPipeline.getBindGroupLayout(0),
	entries: [{ binding: 0, resource: teapotUniformBuffer }],
});

// Define the bind group for drawing shadows
const shadowBindGroup = device.createBindGroup({
	layout: shadowPipeline.getBindGroupLayout(0),
	entries: [
		{ binding: 0, resource: shadowUniformBuffer },
		{ binding: 1, resource: sampler },
		{ binding: 2, resource: groundTexture.createView() },
	],
});

// Create the depth texture
const depthTexture = device.createTexture({
	size: canvas,
	format: "depth24plus-stencil8",
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
			stencilLoadOp: "clear",
			stencilStoreOp: "store",
		},
	});

	pass.setVertexBuffer(0, positionBuffer);
	pass.setVertexBuffer(1, texcoordBuffer);
	pass.setIndexBuffer(indexBuffer, "uint32");
	pass.setBlendConstant([0.4, 0.4, 0.4, 1]);
	pass.setStencilReference(1);

	pass.setPipeline(groundPipeline);
	pass.setBindGroup(0, groundBindGroup);
	pass.drawIndexed(6);

	pass.setPipeline(shadowPipeline);
	pass.setBindGroup(0, shadowBindGroup);
	pass.drawIndexed(teapot.indices.length, 1, ground.indices.length, ground.vertices.length / 4);

	pass.setPipeline(teapotPipeline);
	pass.setVertexBuffer(1, normalBuffer);
	pass.setBindGroup(0, teapotBindGroup);
	pass.drawIndexed(teapot.indices.length, 1, ground.indices.length, ground.vertices.length / 4);

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
	const shadowModel = mat4(
		1 + ly, -lx, 0, -lx,
		0, 1, 0, -ly,
		0, -lz, 1 + ly, -lz,
		0, -1, 0, ly,
	);
	device.queue.writeBuffer(shadowUniformBuffer, 0, flatten(mult(shadowModel, teapotModel)));
	// Also update the position of the point light for the Phong shading
	device.queue.writeBuffer(teapotUniformBuffer, 3 * sizeof["mat4"] + sizeof["vec4"], new Float32Array([lx, ly, lz, 1]));
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
