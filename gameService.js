import { supabase } from './supabaseClient.js';

/**
 * 订阅实时更新
 * @param {string} matchId 对战房ID
 * @param {function} callback 收到更新后的回调函数
 */
export const subscribeToMatch = (matchId, callback) => {
  return supabase
    .channel(`match:${matchId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'game',
      table: 'matches',
      filter: `id=eq.${matchId}`
    }, (payload) => {
      callback(payload.new);
    })
    .subscribe();
};

/**
 * 提交落子信息
 */
export const updateBoard = async (matchId, newBoard, nextPlayerId) => {
  const { error } = await supabase
    .from('matches')
    .update({
      board_state: newBoard,
      current_turn: nextPlayerId
    })
    .eq('id', matchId);

  if (error) throw error;
};

/**
 * 获取当前棋局状态
 */
export const getMatchStatus = async (matchId) => {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();
  
  if (error) throw error;
  return data;
};
