const TAU = 6.283185307179586;

struct Uniforms {
	model: mat4x4f,
	view: mat4x4f,
	proj: mat4x4f,
	eye_pos: vec4f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var texture: texture_2d<f32>;

const le = vec4f(0, 0, -1, 0);
const Le = vec3f(1, 1, 1);
const La = vec3f(0.25);
const ks = vec3f(0.25);
const Li = Le;
const s = 4;

struct VSOut {
	@builtin(position) pos: vec4f,
	@location(0) world_pos: vec4f,
	@location(1) world_normal: vec4f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @location(1) normal: vec4f) -> VSOut {
	// Get the model vectors in world space
	let world_pos = u.model * pos;
	let world_normal = u.model * normal;

	// Output the results for the fragment shader
	var out: VSOut;
	out.pos = u.proj * u.view * world_pos;
	out.world_pos = world_pos;
	out.world_normal = world_normal;
	return out;
}

@fragment
fn main_fs(@location(0) world_pos: vec4f, @location(1) world_normal: vec4f) -> @location(0) vec4f {
	// Renormalise the normal
	let normal = normalize(world_normal);

	// Calculate the needed vectors
	let ωi = -le;
	let ωr = reflect(ωi, normal);
	let ωo = normalize(world_pos - u.eye_pos);

	// Calculate the texture coordinates
	let u = atan2(world_pos.x, world_pos.z) / TAU + 0.5;
	let v = acos(world_pos.y) * 2 / TAU;

	// Use the texture for kd and ka
	let kd = textureSample(texture, samp, vec2f(u, v)).rgb;
	let ka = kd;

	// Calculate the lighting values
	let Lrd = kd * Li * max(dot(normal, ωi), 0.0);
	let Lra = ka * La;
	let Lrs = ks * Li * pow(max(dot(ωr, ωo), 0), s);
	let Lo = Lrd + Lrs + Lra;

	// Use the result as the final colour
	return vec4f(Lo, 1.0);
}
