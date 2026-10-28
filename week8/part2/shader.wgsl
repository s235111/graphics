const TAU = 6.283185307179586;

struct Uniforms {
	model: mat4x4f,
	view: mat4x4f,
	proj: mat4x4f,
	visibility: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var texture: texture_2d<f32>;

struct VSOut {
	@builtin(position) pos: vec4f,
	@location(0) texcoord: vec2f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @location(1) texcoord: vec2f) -> VSOut {
	var out: VSOut;
	out.pos = u.proj * u.view * u.model * pos;
	out.texcoord = texcoord;
	return out;
}

@fragment
fn main_fs(@location(0) texcoord: vec2f) -> @location(0) vec4f {
	// Sample the texture and use the colour as-is
	return u.visibility * textureSample(texture, samp, texcoord);
}
