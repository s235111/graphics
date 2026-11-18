import { add, flatten, length, lookAt, lookFromVectors, lookVectors, mat4, mult, normalize, perspective, scale, sizeof, translate } from "../MV.js";
import { readOBJFile } from "../OBJParser.js";

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
const ground = {
	vertices: new Float32Array([-2, -1, -1, 1, 2, -1, -1, 1, -2, -1, -5, 1, 2, -1, -5, 1]),
	normals: new Float32Array([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]),
	texcoords: new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
	indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
};

// Load the 3D model
const teapot = await readOBJFile("../utah_teapot.obj", 0.25, false, false);
const teapotModel = translate(0, -1, -3);

function createVertexBuffer(byteLength, dimensions, shaderLocation) {
	const buffer = device.createBuffer({
		size: byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});

	const layout = {
		arrayStride: sizeof["vec" + dimensions],
		attributes: [{
			format: "float32x" + dimensions,
			offset: 0,
			shaderLocation: shaderLocation,
		}],
	};

	return [buffer, layout];
}

// Create the vertex buffers and their layout descriptors
const [positionBuffer, positionBufferLayout] = createVertexBuffer(ground.vertices.byteLength + teapot.vertices.byteLength, 4, 0);
const [normalBuffer, normalBufferLayout] = createVertexBuffer(ground.normals.byteLength + teapot.normals.byteLength, 4, 1);
const [texcoordBuffer, texcoordBufferLayout] = createVertexBuffer(ground.texcoords.byteLength + teapot.texcoords.byteLength, 2, 2);

// Create the index buffer
const indexBuffer = device.createBuffer({
	size: ground.indices.byteLength + teapot.indices.byteLength,
	usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});

// Write to all the buffers
device.queue.writeBuffer(positionBuffer, 0, ground.vertices);
device.queue.writeBuffer(positionBuffer, ground.vertices.byteLength, teapot.vertices);
device.queue.writeBuffer(normalBuffer, 0, ground.normals);
device.queue.writeBuffer(normalBuffer, ground.normals.byteLength, teapot.normals);
device.queue.writeBuffer(texcoordBuffer, 0, ground.texcoords);
device.queue.writeBuffer(texcoordBuffer, ground.texcoords.byteLength, teapot.texcoords);
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

const shadowSampler = device.createSampler({ compare: "less", magFilter: "linear" });

// Create the render pipeline for the ground
const mainPipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module, entryPoint: "main_vs", buffers: [positionBufferLayout, normalBufferLayout, texcoordBufferLayout] },
	fragment: { module, entryPoint: "main_fs", targets: [{ format }] },
	depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus" },
	primitive: { topology: "triangle-list", cullMode: "back" },
});

// Create the render pipeline for drawing shadows
const shadowPipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module, entryPoint: "light_vs", buffers: [positionBufferLayout] },
	fragment: { module, entryPoint: "light_fs", targets: [] },
	depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth32float" },
	primitive: { topology: "triangle-list", cullMode: "back" },
});

// Create the projection matrices
const projection = perspective(90, canvas.width / canvas.height, 0.1, 10);
const lightProjection = perspective(90, 1, 0.1, 10);
// Convert the OpenGL-style projection matrix from MV.js to WebGPU-style
// This is equivalent to using the Mst as mentioned in the slides
for (let i = 0; i < 4; i++) projection[2][i] = (projection[2][i] + projection[3][i]) * 0.5;
for (let i = 0; i < 4; i++) lightProjection[2][i] = (lightProjection[2][i] + lightProjection[3][i]) * 0.5;

// Create the global uniform buffer
const uniformBuffer = device.createBuffer({
	size: 3 * sizeof["mat4"] + 2 * sizeof["vec4"],
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
// Everything else gets written with update() further down
device.queue.writeBuffer(uniformBuffer, 2 * sizeof["mat4"], flatten(projection));

// Create the uniform buffer for the ground
const groundUniformBuffer = device.createBuffer({
	size: sizeof["mat4"],
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
// The model matrix is just the identity matrix in this case
device.queue.writeBuffer(groundUniformBuffer, 0, flatten(mat4()));

// Create the uniform buffer for the teapot
const teapotUniformBuffer = device.createBuffer({
	size: sizeof["mat4"],
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(teapotUniformBuffer, 0, flatten(teapotModel));

// Create the depth texture
const depthTexture = device.createTexture({
	size: canvas,
	format: "depth24plus",
	usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// Create the shadow depth texture
const shadowTexture = device.createTexture({
	size: [1024, 1024],
	format: "depth32float",
	usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
});

function createBindGroups(modelUniformBuffer, texture) {
	const mainBindGroup = device.createBindGroup({
		layout: mainPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: uniformBuffer },
			{ binding: 1, resource: modelUniformBuffer },
			{ binding: 2, resource: sampler },
			{ binding: 3, resource: texture.createView() },
			{ binding: 4, resource: shadowSampler },
			{ binding: 5, resource: shadowTexture.createView() },
		],
	});

	const shadowBindGroup = device.createBindGroup({
		layout: shadowPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: uniformBuffer },
			{ binding: 1, resource: modelUniformBuffer },
		],
	});

	return [mainBindGroup, shadowBindGroup];
}

// Define the bind groups
const [groundBindGroup, groundShadowBindGroup] = createBindGroups(groundUniformBuffer, groundTexture);
const [teapotBindGroup, teapotShadowBindGroup] = createBindGroups(teapotUniformBuffer, groundTexture);

function render() {
	const encoder = device.createCommandEncoder();

	// Shadow pass
	const shadowPass = encoder.beginRenderPass({
		colorAttachments: [],
		depthStencilAttachment: {
			view: shadowTexture.createView(),
			depthLoadOp: "clear",
			depthStoreOp: "store",
			depthClearValue: 1.0,
		},
	});

	shadowPass.setPipeline(shadowPipeline);
	shadowPass.setVertexBuffer(0, positionBuffer);
	shadowPass.setIndexBuffer(indexBuffer, "uint32");

	shadowPass.setBindGroup(0, groundShadowBindGroup);
	shadowPass.drawIndexed(6);
	shadowPass.setBindGroup(0, teapotShadowBindGroup);
	shadowPass.drawIndexed(teapot.indices.length, 1, ground.indices.length, ground.vertices.length / 4);

	shadowPass.end();

	// Main pass
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

	pass.setPipeline(mainPipeline);
	pass.setVertexBuffer(0, positionBuffer);
	pass.setVertexBuffer(1, normalBuffer);
	pass.setVertexBuffer(2, texcoordBuffer);
	pass.setIndexBuffer(indexBuffer, "uint32");

	pass.setBindGroup(0, groundBindGroup);
	pass.drawIndexed(6);

	pass.setBindGroup(0, teapotBindGroup);
	pass.drawIndexed(teapot.indices.length, 1, ground.indices.length, ground.vertices.length / 4);

	pass.end();

	// Submit everything to the GPU
	device.queue.submit([encoder.finish()]);
}

// Camera controls
let yaw = 0;
let pitch = 0;
let cameraPos = [0, 0, 0];
const keys = { KeyW: "forward", KeyA: "left", KeyS: "back", KeyD: "right", Space: "up", ShiftLeft: "down" };
const keyStates = Object.fromEntries(Object.values(keys).map(key => [key, false]));
const sensitivitySlider = document.getElementById("sensitivity");
const speedSlider = document.getElementById("speed");
canvas.addEventListener("mousemove", e => {
	if (document.pointerLockElement !== canvas) return;
	const sensitivity = sensitivitySlider.valueAsNumber;
	yaw += e.movementX * sensitivity;
	pitch -= e.movementY * sensitivity;
	if (Math.abs(pitch) > 90) pitch = Math.sign(pitch) * 90;
});
canvas.addEventListener("click", e => {
	if (e.button !== 0) return;
	if (document.pointerLockElement === canvas) {
		document.exitPointerLock();
	} else {
		canvas.requestPointerLock();
	}
});
document.addEventListener("keydown", e => { if (keys[e.code]) { keyStates[keys[e.code]] = true; e.preventDefault(); } });
document.addEventListener("keyup", e => { if (keys[e.code]) { keyStates[keys[e.code]] = false; e.preventDefault(); } });

function update(dt) {
	// Vector calculations for camera orientation and movement
	// Not having operator overloading in Javascript sucks...
	const [forward, right, up] = lookVectors(yaw, pitch);
	let movement = scale(keyStates.forward - keyStates.back, forward);
	movement = add(movement, scale(keyStates.right - keyStates.left, right));
	movement = add(movement, scale(keyStates.up - keyStates.down, [0, 1, 0]));
	if (length(movement) > 0) movement = normalize(movement);
	movement = scale(speedSlider.valueAsNumber * dt, movement);
	// Update the camera position and calculate the view matrix
	cameraPos = add(cameraPos, movement);
	const view = lookFromVectors(cameraPos, forward, right, up);
	// Update the point light position and calculate the light view-projection matrix
	//const lightPos = add(cameraPos, scale(1, forward));
	//const lightView = lookFromVectors(lightPos, forward, right, up);
	const lightPos = [0, 1, 2];
	const lightView = lookAt(lightPos, [0, 0, -2], [0, 1, 0]);
	const lightViewProj = flatten(mult(lightProjection, lightView));
	// Update everything on the GPU
	device.queue.writeBuffer(uniformBuffer, 0, lightViewProj);
	device.queue.writeBuffer(uniformBuffer, sizeof["mat4"], flatten(view));
	device.queue.writeBuffer(uniformBuffer, 3 * sizeof["mat4"], flatten([...cameraPos, 1]));
	device.queue.writeBuffer(uniformBuffer, 3 * sizeof["mat4"] + sizeof["vec4"], new Float32Array([...lightPos, 1]));
}

let lastTime = 0;
function animate(time) {
	update((time - lastTime) / 1000);
	lastTime = time;
	render();
	requestAnimationFrame(animate);
}
animate(0);
