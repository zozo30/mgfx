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
