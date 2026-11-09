const TAU = 6.283185307179586;

struct Uniforms {
	lightViewProj: mat4x4f,
	model: mat4x4f,
	view: mat4x4f,
	proj: mat4x4f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var texture: texture_2d<f32>;
@group(0) @binding(3) var shadowSampler: sampler_comparison;
@group(0) @binding(4) var shadowTexture: texture_depth_2d;

struct VSOut {
	@builtin(position) pos: vec4f,
	@location(0) world_pos: vec4f,
	@location(1) texcoord: vec2f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @location(1) texcoord: vec2f) -> VSOut {
	let world_pos = u.model * pos;
	var out: VSOut;
	out.pos = u.proj * u.view * world_pos;
	out.world_pos = world_pos;
	out.texcoord = texcoord;
	return out;
}

@fragment
fn main_fs(@builtin(position) pos: vec4f, @location(0) world_pos: vec4f, @location(1) texcoord: vec2f) -> @location(0) vec4f {
	// Sample the shadow map for light visibility using PCF
	var shadow_pos = u.lightViewProj * world_pos;
	shadow_pos /= shadow_pos.w;
	let shadow_coord = vec2f(shadow_pos.x * 0.5 + 0.5, shadow_pos.y * -0.5 + 0.5);
	var visibility = 0.0;
	let texel_size = 1.0 / vec2f(textureDimensions(shadowTexture));
	for (var y = -1.5; y <= 1.5; y += 1.0) {
		for (var x = -1.5; x <= 1.5; x += 1.0) {
			let sample_coord = shadow_coord + vec2f(x, y) * texel_size;
			visibility += textureSampleCompareLevel(shadowTexture, shadowSampler, sample_coord, shadow_pos.z - 0.001);
		}
	}
	visibility *= 0.0625;

	// Make shadows not completely dark
	let light = visibility * 0.75 + 0.25;

	// Sample the texture and multiply it with the "light"
	return light * textureSample(texture, samp, texcoord);
}
