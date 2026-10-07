// -------------------------------------------------------------------------------------
// Generate mipmap
//
// Implemented by Jeppe Revall Frisvad, 2025, with inspiration from WebGPU Fundamentals
// https://webgpufundamentals.org/webgpu/lessons/webgpu-importing-textures.html
// -------------------------------------------------------------------------------------

export function numMipLevels(...sizes) {
	const maxSize = Math.max(...sizes);
	return 1 + Math.floor(Math.log2(maxSize));
}

const shader = /* WGSL */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;

struct VSOutput {
	@builtin(position) position: vec4f,
	@location(0) texcoord: vec2f,
};

@vertex
fn vert(@builtin(vertex_index) vertexIndex: u32) -> VSOutput {
	let pos = array<vec2f, 4>(vec2f(0.0, 1.0), vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0));
	let xy = pos[vertexIndex];
	var out: VSOutput;
	out.position = vec4f(xy*2.0 - 1.0, 0.0, 1.0);
	out.texcoord = vec2f(xy.x, 1.0 - xy.y);
	return out;
}

@fragment
fn frag(@location(0) texcoord: vec2f) -> @location(0) vec4f {
	return textureSample(texture, samp, texcoord);
}`;

let module = null;
let sampler = null;
const pipelineByFormat = {};

export function generateMipmaps(device, texture) {
	module ??= device.createShaderModule({ code: shader });
	sampler ??= device.createSampler({ minFilter: "linear" });
	pipelineByFormat[texture.format] ??= device.createRenderPipeline({
		layout: "auto",
		vertex: { module },
		fragment: { module, targets: [{ format: texture.format }] },
		primitive: { topology: "triangle-strip" },
	});
	const pipeline = pipelineByFormat[texture.format];

	const encoder = device.createCommandEncoder();
	for (let i = 1; i < texture.mipLevelCount; i++) {
		const bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: sampler },
				{ binding: 1, resource: texture.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }) },
			],
		});
		const pass = encoder.beginRenderPass({
			colorAttachments: [{
				view: texture.createView({ baseMipLevel: i, mipLevelCount: 1 }),
				loadOp: "clear",
				storeOp: "store",
			}],
		});
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(4);
		pass.end();
	}
	const commandBuffer = encoder.finish();
	device.queue.submit([commandBuffer]);
};
