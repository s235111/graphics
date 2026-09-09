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

// Calculate all the entries for the position and colour buffers
const points = 64;
const positions = [];
const colors = [];
let c = 0.5, s = 0;
let r = 1, g = 0, b = 0;
const clamp01 = x => x < 0 ? x : x > 1 ? 1 : x;
const channel = h => clamp01(Math.abs(3 - h % 6) - 1);
for (let i = 1; true; i++) {
	const theta = i / points * 2 * Math.PI;
	const h = 6 * i / points;
	positions.push([0, 0], [c, s]);
	colors.push([1, 1, 1], [r, g, b]);
	if (i >= points) break;
	c = Math.cos(theta) * 0.5;
	s = Math.sin(theta) * 0.5;
	r = channel(h + 6);
	g = channel(h + 4);
	b = channel(h + 2);
	positions.push([c, s]);
	colors.push([r, g, b]);
}
positions.push([0.5, 0]);
colors.push([1, 0, 0]);

// Create the position buffer and describe its layout
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

// Create the colour buffer and describe its layout
const colorBuffer = device.createBuffer({
	size: flatten(colors).byteLength,
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(colorBuffer, 0, flatten(colors));

const colorBufferLayout = {
	arrayStride: sizeof["vec3"],
	attributes: [{
		format: "float32x3",
		offset: 0,
		shaderLocation: 1,
	}],
};

// Create the render pipeline
const pipeline = device.createRenderPipeline({
	layout: "auto",
	vertex: { module, entryPoint: "main_vs", buffers: [positionBufferLayout, colorBufferLayout] },
	fragment: { module, entryPoint: "main_fs", targets: [{ format }] },
	primitive: { topology: "triangle-list" },
});

// Create the uniform buffer
const uniforms = new Float32Array(6);

const uniformBuffer = device.createBuffer({
	size: uniforms.byteLength,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniforms);

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
	pass.setVertexBuffer(1, colorBuffer);
	pass.draw(positions.length);

	pass.end();
	device.queue.submit([encoder.finish()]);
}

// The options
const animToggle = document.getElementById("anim");
const stepAnim = document.getElementById("step");
const jumpVelInput = document.getElementById("jumpvel");
const stretchInput = document.getElementById("stretch");
const squashInput = document.getElementById("squash");
const squashDurInput = document.getElementById("squashdur");

// Initial values and simulation variables
const gravity = -9.81;
let ballPos = vec2(0, -0.5);
let ballVel = vec2(1, jumpVelInput.valueAsNumber);
let ballSquish = [1, 0, 0, 1];
let squashTime = -1;

function update(dt) {
	// Read the options
	const jumpVel = jumpVelInput.valueAsNumber;
	const stretch = stretchInput.valueAsNumber;
	const squash = squashInput.valueAsNumber;
	const squashDur = squashDurInput.valueAsNumber;
	if (squashTime === -1) {
		// Update velocity and position
		ballVel[1] += gravity * dt;
		ballPos[0] += ballVel[0] * dt;
		ballPos[1] += ballVel[1] * dt;
		// Handle floor collision
		if (ballPos[1] <= -0.5) {
			ballPos[1] = -0.5;
			squashTime = 0;
		}
		// Handle wall collisions
		if (Math.abs(ballPos[0]) >= 0.5) {
			ballVel[0] = -ballVel[0];
			ballPos[0] = Math.sign(ballPos[0]) * 0.5;
		}
		// Calculate the stretch
		const velocity = Math.hypot(...ballVel);
		const sy = 1 + stretch * velocity;
		const sx = 1 / Math.sqrt(sy);
		let [vx, vy] = ballVel;
		vx /= velocity, vy /= velocity;
		ballSquish = [-vy * sx, vx * sx, -vx * sy, -vy * sy];
	} else {
		// Calculate the squash
		const sy = 1 - squash * jumpVel * Math.sin(squashTime / squashDur * Math.PI);
		const sx = 1 / Math.sqrt(sy);
		ballSquish = [sx, 0, 0, sy];
		ballPos[1] = -1 + sy * 0.5;
		// Handle squash timer
		squashTime += dt;
		if (squashTime >= squashDur) {
			ballVel[1] = jumpVel;
			squashTime = -1;
		}
	}
	// Put the position and squish into the uniform buffer
	uniforms.set(ballPos);
	uniforms.set(ballSquish, 2);
}

let shouldAnimate = true;
function animate(time) {
	update(1 / 60);
	device.queue.writeBuffer(uniformBuffer, 0, uniforms);
	render();
	if (shouldAnimate) requestAnimationFrame(animate);
}
animate();

function toggleAnimation(enable) {
	shouldAnimate = enable;
	animToggle.textContent = shouldAnimate ? "Pause animation" : "Resume animation";
}

animToggle.addEventListener("click", () => {
	toggleAnimation(!shouldAnimate);
	if (shouldAnimate) animate();
});

stepAnim.addEventListener("click", () => {
	toggleAnimation(false);
	animate();
});
