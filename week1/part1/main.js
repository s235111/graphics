// Initialise WebGPU and canvas
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format });

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

pass.end();
device.queue.submit([encoder.finish()]);
