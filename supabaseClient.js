/* One Auth/Realtime client; database schema is explicit at each boundary. */
(() => {
  'use strict';
  let client = null;
  function getClient() { return client; }
  async function requireClient() {
    await ready;
    if (!client) throw new Error('Supabase 配置不可用，请检查公开配置');
    return client;
  }
  async function requireUser() {
    const sdk = await requireClient();
    const { data, error } = await sdk.auth.getUser();
    if (error || !data?.user?.id) throw new Error('请先登录后再进行联机对局');
    return data.user;
  }
  async function getProfile(playerId) {
    const sdk = await requireClient();
    const { data, error } = await sdk.schema('public').rpc('get_player_profile', { player_id: playerId });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }
  const ready = window.NobiConfig.ready.then(config => {
    if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY && window.supabase?.createClient) {
      client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, { db: { schema: 'public' }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !window.NobiPlatform?.isNative() } });
    }
    return client;
  });
  window.NobiServices = Object.freeze({ ready, getClient, requireClient, requireUser, getProfile });
  window.getSupabaseClient = getClient;
})();
