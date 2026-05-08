export async function onRequest(context) {
  const anonKey = context.env.SUPABASE_ANON_KEY;
  
  // 检查请求来源 (Referer)
  const referer = context.request.headers.get("referer");
  
  // 如果不是从你的域名发起的请求，则拒绝（防止直接在浏览器输入 URL 访问）
  if (!referer || !referer.includes("nobistudio.com")) {
    return new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    SUPABASE_ANON_KEY: anonKey
  }), {
    headers: { "Content-Type": "application/json" },
  });
}
