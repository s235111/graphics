import { flatten, mat4, mult, perspective, sizeof } from "../../MV.js";
import { generateMipmaps, numMipLevels } from "../../mipmap.js";

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
	vertices: new Float32Array([-4, -1, -1, 4, -1, -1, 4, -1, -21, -4, -1, -21]),
	texcoords: new Float32Array([-1.5, 0, 2.5, 0, 2.5, 10, -1.5, 10]),
	indices: new Uint16Array([0, 1, 3, 3, 1, 2]),
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

// Create a checkerboard texture and write it to the GPU
const textureSize = 64;
const numCells = 8;
const cellSize = textureSize / numCells;
const textureBuffer = new Uint8Array(4 * textureSize * textureSize);
for (let y = 0; y < textureSize; y++) {
	for (let x = 0; x < textureSize; x++) {
		const cellX = Math.floor(x / cellSize);
		const cellY = Math.floor(y / cellSize);
		const c = (cellX + cellY) % 2 * 255;
		textureBuffer.set([c, c, c, 255], 4 * (y * textureSize + x));
	}
}
const texture = device.createTexture({
	size: [textureSize, textureSize],
	format: "rgba8unorm",
	usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
	mipLevelCount: numMipLevels(textureSize),
});
device.queue.writeTexture({ texture }, textureBuffer, { bytesPerRow: textureSize * 4 }, [textureSize, textureSize]);

// Generate the mipmaps
generateMipmaps(device, texture);

// Create a sampler for the texture
const sampler = device.createSampler({
	addressModeU: "repeat",
	addressModeV: "repeat",
	magFilter: "nearest",
	minFilter: "nearest",
	mipmapFilter: "nearest",
});

// Create the render pipeline
const pipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module, entryPoint: "main_vs", buffers: [positionBufferLayout, texcoordBufferLayout] },
	fragment: { module, entryPoint: "main_fs", targets: [{ format }] },
	depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus" },
	primitive: { topology: "triangle-list", cullMode: "back" },
});

// Create the projection and view matrices
const Mst = mat4();
Mst[2][2] = 0.5, Mst[2][3] = 0.5;
const projection = perspective(90, canvas.width / canvas.height, 0.1, 30);
const view = mat4();

// Create the uniform buffer
const uniformBuffer = device.createBuffer({
	size: 3 * sizeof["mat4"],
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
// The model matrix is just the identity matrix in this case
device.queue.writeBuffer(uniformBuffer, 0, flatten(mat4()));
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"], flatten(view));
device.queue.writeBuffer(uniformBuffer, sizeof["mat4"] * 2, flatten(mult(Mst, projection)));

// Define the bind group for the uniforms, sampler, and texture
const bindGroup = device.createBindGroup({
	layout: pipeline.getBindGroupLayout(0),
	entries: [
		{ binding: 0, resource: uniformBuffer },
		{ binding: 1, resource: sampler },
		{ binding: 2, resource: texture.createView() },
	],
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
	pass.setVertexBuffer(1, texcoordBuffer);
	pass.setIndexBuffer(indexBuffer, "uint16");
	pass.drawIndexed(model.indices.length);

	pass.end();
	device.queue.submit([encoder.finish()]);
}

function animate() {
	render();
	requestAnimationFrame(animate);
}
animate();
