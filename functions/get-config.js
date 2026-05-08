export async function onRequest(context) {
  // 从环境变量中提取 URL 和 Key
  const supabaseUrl = context.env.SUPABASE_URL;
  const anonKey = context.env.SUPABASE_ANON_KEY;
  
  // 检查请求来源 (Referer)
  const referer = context.request.headers.get("referer");
  
  // 安全检查：如果不是从你的域名发起的请求，则拒绝访问
  if (!referer || !referer.includes("nobistudio.com")) {
    return new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 返回包含两个变量的 JSON 对象
  return new Response(JSON.stringify({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: anonKey
  }), {
    headers: { 
      "Content-Type": "application/json",
      // 如果你的前端和后端不在同一个子域，可能还需要处理 CORS
      "Access-Control-Allow-Origin": "https://nobistudio.com" 
    },
  });
}
