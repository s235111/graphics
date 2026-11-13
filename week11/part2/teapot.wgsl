const TAU = 6.283185307179586;

struct Uniforms {
	lightViewProj: mat4x4f,
	model: mat4x4f,
	view: mat4x4f,
	proj: mat4x4f,
	eye_pos: vec4f,
	light_pos: vec4f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var shadowSampler: sampler_comparison;
@group(0) @binding(2) var shadowTexture: texture_depth_2d;

const Le = vec3f(1.00);
const La = vec3f(0.50);
const kd = vec3f(0.50);
const ka = kd;
const ks = vec3f(0.25);
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

	// Renormalise the normal
	let normal = normalize(world_normal);

	// Calculate the needed vectors
	let ωi = normalize(u.light_pos - world_pos);
	let ωr = reflect(ωi, normal);
	let ωo = normalize(world_pos - u.eye_pos);

	// Calculate the lighting values
	let Li = visibility * Le;
	let Lrd = kd * Li * max(dot(normal, ωi), 0.0);
	let Lra = ka * La;
	let Lrs = ks * Li * pow(max(dot(ωr, ωo), 0), s);
	let Lo = Lrd + Lrs + Lra;

	// Use the result as the final colour
	return vec4f(Lo, 1.0);
}
