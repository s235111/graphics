import { flatten, sizeof, vec2 } from "../../MV.js";

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

// Create the position buffer and describe its layout
const pointSize = 20 * (2 / canvas.height);
const positions = [];
addPoint(positions, vec2(0.0, 0.0), pointSize);
addPoint(positions, vec2(1.0, 0.0), pointSize);
addPoint(positions, vec2(1.0, 1.0), pointSize);

const positionBuffer = device.createBuffer({
	size: flatten(positions).byteLength,
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(positionBuffer, 0, flatten(positions));

const positionBufferLayout = {
	arrayStride: sizeof["vec2"],
	attributes: [{
		format: "float32x2",
		offset: 0,
		shaderLocation: 0,
	}],
};

// Create the render pipeline
const pipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module, entryPoint: "main_vs", buffers: [positionBufferLayout] },
	fragment: { module, entryPoint: "main_fs", targets: [{ format }] },
	primitive: { topology: "triangle-list" },
});

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
pass.setVertexBuffer(0, positionBuffer);
pass.draw(positions.length);

pass.end();
device.queue.submit([encoder.finish()]);

function addPoint(array, point, size) {
	const offset = size / 2;
	const l = point[0] - offset, r = point[0] + offset;
	const b = point[1] - offset, t = point[1] + offset;
	array.push(
		vec2(l, b), vec2(r, b), vec2(l, t),
		vec2(l, t), vec2(r, b), vec2(r, t),
	);
}
