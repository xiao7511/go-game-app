(() => {
  const OVERLAY_ID = 'match-overlay';

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.hidden = true;
    overlay.innerHTML = `
      <style>
        #${OVERLAY_ID} {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          background: rgba(7, 12, 18, 0.74);
          backdrop-filter: blur(10px);
        }
        #${OVERLAY_ID}[hidden] { display: none; }
        #${OVERLAY_ID} .panel {
          width: min(92vw, 420px);
          padding: 28px 24px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.12);
          background: linear-gradient(180deg, rgba(18,24,33,0.96), rgba(10,16,22,0.96));
          text-align: center;
          box-shadow: 0 28px 72px rgba(0,0,0,0.45);
        }
        #${OVERLAY_ID} h2 {
          margin: 0 0 10px;
          font-size: 1.25rem;
        }
        #${OVERLAY_ID} p {
          margin: 0;
          color: rgba(238,244,251,0.76);
        }
        #${OVERLAY_ID} .spinner {
          width: 72px;
          height: 72px;
          margin: 0 auto 18px;
          border-radius: 50%;
          border: 5px solid rgba(255,255,255,0.10);
          border-top-color: #f6c453;
          animation: go-spin 1s linear infinite;
        }
        #${OVERLAY_ID} .dots {
          display: inline-flex;
          gap: 6px;
          margin-left: 6px;
          vertical-align: middle;
        }
        #${OVERLAY_ID} .dots span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #6ee7ff;
          animation: go-bounce 1.1s infinite ease-in-out;
        }
        #${OVERLAY_ID} .dots span:nth-child(2) { animation-delay: 0.15s; }
        #${OVERLAY_ID} .dots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes go-spin { to { transform: rotate(360deg); } }
        @keyframes go-bounce { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.45; } 40% { transform: scale(1); opacity: 1; } }
      </style>
      <div class="panel" role="status" aria-live="polite">
        <div class="spinner"></div>
        <h2>正在寻找对手...</h2>
        <p>系统已进入匹配队列，请稍候<span class="dots"><span></span><span></span><span></span></span></p>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showMatchingOverlay() {
    ensureOverlay().hidden = false;
  }

  function hideMatchingOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.hidden = true;
  }

  let movesChannel = null;

  async function bindMoves({ supabaseClient, sessionId, currentUserId, onRemoteMove, onError }) {
    if (!supabaseClient || !sessionId) return;
    if (movesChannel) {
      supabaseClient.removeChannel(movesChannel);
      movesChannel = null;
    }
    movesChannel = supabaseClient
      .channel(`moves-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'moves',
        filter: `session_id=eq.${sessionId}`
      }, payload => {
        const row = payload.new;
        if (!row || row.user_id === currentUserId) return;
        try {
          onRemoteMove?.(row);
        } catch (err) {
          onError?.(err);
        }
      })
      .subscribe();
  }

  function unbindMoves(supabaseClient) {
    if (movesChannel && supabaseClient) {
      supabaseClient.removeChannel(movesChannel);
    }
    movesChannel = null;
  }

  window.GoGameUI = { showMatchingOverlay, hideMatchingOverlay };
  window.GoGameRealtime = { bindMoves, unbindMoves };
})();
