;(function () {
  if (typeof window === 'undefined' || !window.__ModuleLoader__) return
  window.__ModuleLoader__.load({
    id: 'dsh-native-media-tools',
    factory: function (require) {
      const React = require('react')
      const h = React.createElement
      const shell = { padding: '10px 12px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', background: 'var(--dsw-alias-bg-layer-2)' }
      const player = { width: '100%', maxWidth: '640px', display: 'block', borderRadius: '9px', background: '#000' }
      const muted = { margin: '7px 0 0', fontSize: '12px', opacity: 0.66, overflowWrap: 'anywhere' }

      function resultValue(block) {
        if (!block || block.kind !== 'tool-result') return undefined
        const texts = (block.content || []).filter((item) => item && item.type === 'text').map((item) => item.text)
        for (const text of texts) {
          try {
            const value = JSON.parse(text)
            if (value && typeof value === 'object') return value
          } catch {}
        }
        return undefined
      }

      function MediaCard(props) {
        const value = resultValue(props.block)
        if (!value) return h('div', { style: shell }, '媒体处理中…')
        if (!value.url) return h('div', { style: shell }, '媒体已创建（播放器 URL 不可用）。')
        const video = value.kind === 'video' || value.kind === 'video-analysis' || String(value.mime_type || '').startsWith('video/')
        return h('div', { style: shell },
          h(video ? 'video' : 'audio', { src: value.url, controls: true, playsInline: true, preload: 'metadata', style: video ? player : { width: '100%' } }),
          h('p', { style: muted }, `${value.mime_type || (video ? 'video' : 'audio')} · ${value.bytes ? `${value.bytes} bytes · ` : ''}${value.path || ''}`),
        )
      }

      function AnalysisCard(props) {
        const value = resultValue(props.block)
        if (!value) return h('div', { style: shell }, '正在抽帧、转写并理解视频…')
        return h('div', { style: shell },
          value.url ? h('video', { src: value.url, controls: true, playsInline: true, preload: 'metadata', style: player }) : null,
          h('div', { style: { marginTop: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.65 } }, value.analysis || '分析完成。'),
          h('p', { style: muted }, value.strategy === 'original-file'
            ? `${Number(value.metadata?.duration || 0).toFixed(1)} 秒 · 原始视频文件 + 原声音轨`
            : `${Number(value.metadata?.duration || 0).toFixed(1)} 秒 · ${value.sampled_frames || 0} 帧 · ${value.audio_mode || '无音轨'} · 约每 ${Number(value.frame_interval_seconds || 0).toFixed(1)} 秒采样`),
        )
      }

      function apply(ctx) {
        ctx.slots.inject('tool.call.toolview', function* () {
          yield ctx.slots.register({ name: 'tool.call.toolview', key: 'media_text_to_speech' }, MediaCard)
          yield ctx.slots.register({ name: 'tool.call.toolview', key: 'present_local_media' }, MediaCard)
          yield ctx.slots.register({ name: 'tool.call.toolview', key: 'analyze_long_video' }, AnalysisCard)
        })
      }
      return { name: 'dsh-native-media-tools-client', inject: ['slots'], apply }
    },
  })
})()
