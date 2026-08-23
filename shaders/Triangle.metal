#include <metal_stdlib>

using namespace metal;

struct VertexOut {
    float4 position [[position]];
    float4 color;
};

struct Vertex {
    packed_float2 position;
    packed_float4 color;
};

vertex VertexOut vertexMain(const device Vertex* vertices [[buffer(0)]],
                            uint vertexId [[vertex_id]]) {
    const float4 color = vertices[vertexId].color;
    return {float4(vertices[vertexId].position, 0.0, 1.0),
            float4(color.rgb * color.a, color.a)};
}

fragment float4 fragmentMain(VertexOut in [[stage_in]]) {
    return in.color;
}

struct ImageVertex {
    packed_float2 position;
    packed_float2 uv;
    packed_float4 tint;
};

struct ImageVertexOut {
    float4 position [[position]];
    float2 uv;
    float4 tint;
};

vertex ImageVertexOut imageVertexMain(const device ImageVertex* vertices [[buffer(0)]],
                                      uint vertexId [[vertex_id]]) {
    const ImageVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.uv, value.tint};
}

fragment float4 imageFragmentMain(ImageVertexOut in [[stage_in]],
                                  texture2d<float> image [[texture(0)]]) {
    constexpr sampler imageSampler(coord::normalized, address::clamp_to_edge, filter::linear);
    const float4 sampled = image.sample(imageSampler, in.uv);
    return float4(sampled.rgb * in.tint.rgb * in.tint.a, sampled.a * in.tint.a);
}

struct ShadowVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 halfSize;
    float radius;
    float blur;
    packed_float4 color;
};

struct ShadowVertexOut {
    float4 position [[position]];
    float2 local;
    float2 halfSize;
    float radius;
    float blur;
    float4 color;
};

vertex ShadowVertexOut shadowVertexMain(const device ShadowVertex* vertices [[buffer(0)]],
                                        uint vertexId [[vertex_id]]) {
    const ShadowVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.halfSize,
            value.radius, value.blur, value.color};
}

fragment float4 shadowFragmentMain(ShadowVertexOut in [[stage_in]]) {
    const float radius = min(in.radius, min(in.halfSize.x, in.halfSize.y));
    const float2 q = abs(in.local) - in.halfSize + radius;
    const float distance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    const float coverage = in.blur > 0.001
        ? 1.0 - smoothstep(-in.blur, in.blur, distance)
        : (distance <= 0.0 ? 1.0 : 0.0);
    const float alpha = in.color.a * coverage;
    return float4(in.color.rgb * alpha, alpha);
}

struct RadialVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    packed_float2 center;
    float radius;
    float cornerRadius;
    packed_float4 innerColor;
    packed_float4 outerColor;
};

struct RadialVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    float2 center;
    float radius;
    float cornerRadius;
    float4 innerColor;
    float4 outerColor;
};

vertex RadialVertexOut radialVertexMain(const device RadialVertex* vertices [[buffer(0)]],
                                        uint vertexId [[vertex_id]]) {
    const RadialVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size, value.center,
            value.radius, value.cornerRadius, value.innerColor, value.outerColor};
}

fragment float4 radialFragmentMain(RadialVertexOut in [[stage_in]]) {
    const float amount = clamp(distance(in.local, in.center) / in.radius, 0.0, 1.0);
    const float4 color = mix(in.innerColor, in.outerColor, amount);
    const float2 halfSize = in.size * 0.5;
    const float radius = min(in.cornerRadius, min(halfSize.x, halfSize.y));
    const float2 q = abs(in.local - halfSize) - halfSize + radius;
    const float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    const float coverage = 1.0 - smoothstep(0.0, max(fwidth(edge), 0.75), edge);
    const float alpha = color.a * coverage;
    return float4(color.rgb * alpha, alpha);
}
