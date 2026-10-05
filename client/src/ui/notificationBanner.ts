// client/src/ui/notificationBanner.ts

export interface NotificationBannerOptions {
  title: string;
  body: string;
  icon?: string;
  durationMs?: number;
  category?: 'territory' | 'landmark' | 'gacha' | 'rank' | string;
  onClick?: () => void;
}

class SoundSynthesizer {
  private static audioCtx: AudioContext | null = null;

  public static playChime(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // Predator HUD x Duolingo signature harmonic chime (A5 -> C#6 -> E6)
      const playTone = (freq: number, startTime: number, duration: number, gainVal: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(gainVal, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      playTone(880.00, now, 0.45, 0.06);        // A5
      playTone(1108.73, now + 0.08, 0.5, 0.07); // C#6
      playTone(1318.51, now + 0.16, 0.6, 0.06); // E6
    } catch {
      // Audio playback may be restricted before initial user gesture
    }
  }
}

export class NotificationBanner {
  private static container: HTMLElement | null = null;
  private static activeBanners: HTMLElement[] = [];
  private static maxConcurrent = 3;

  private static ensureContainer(): HTMLElement {
    if (!this.container || !document.body.contains(this.container)) {
      this.container = document.createElement('div');
      this.container.id = 'notification-banner-container';
      this.container.className = 'notification-banner-container';
      this.container.setAttribute('data-ui', 'true');
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  private static getCategoryMeta(category?: string): { label: string; color: string; borderGlow: string } {
    switch (category) {
      case 'territory':
        return { label: 'LÃNH THỔ', color: '#00ffe8', borderGlow: 'rgba(0, 255, 232, 0.4)' };
      case 'landmark':
        return { label: 'ĐÈN HIỆU & KỲ QUAN', color: '#fbbf24', borderGlow: 'rgba(251, 191, 36, 0.4)' };
      case 'gacha':
        return { label: 'TIẾP TẾ & RƯƠNG', color: '#a855f7', borderGlow: 'rgba(168, 85, 247, 0.4)' };
      case 'rank':
        return { label: 'BẢNG XẾP HẠNG', color: '#10b981', borderGlow: 'rgba(16, 185, 129, 0.4)' };
      default:
        return { label: 'THÔNG BÁO PREDATOR', color: '#00ffe8', borderGlow: 'rgba(0, 255, 232, 0.4)' };
    }
  }

  private static resolveIcon(icon?: string): string {
    if (!icon) return '🦉';
    // If it's already an emoji or symbol
    if (icon.length > 2 && !icon.includes('-') && !/^[a-z_]+$/.test(icon)) {
      return icon;
    }
    switch (icon) {
      case 'clock': return '⏰';
      case 'swords': return '⚔️';
      case 'shield-broken': return '🛡️💥';
      case 'shield-check': return '🛡️✨';
      case 'scissors': return '✂️';
      case 'flame': return '🔥';
      case 'award': return '🏆';
      case 'zap-off': return '⚡';
      case 'hourglass': return '⏳';
      case 'check-circle': return '✅';
      case 'gift': return '🎁';
      case 'sparkles': return '✨';
      case 'map': return '🗺️';
      case 'key': return '🔑';
      case 'trending-up': return '📈';
      case 'trending-down': return '📉';
      case 'target': return '🎯';
      case 'zap': return '⚡';
      default: return '🦉';
    }
  }

  public static show(options: NotificationBannerOptions): HTMLElement {
    const container = this.ensureContainer();
    const durationMs = options.durationMs ?? 6000;
    const catMeta = this.getCategoryMeta(options.category);
    const iconSymbol = this.resolveIcon(options.icon);

    // Play pleasant synthesized chime
    SoundSynthesizer.playChime();

    // Remove oldest if exceeding maximum stack
    if (this.activeBanners.length >= this.maxConcurrent) {
      const oldest = this.activeBanners.shift();
      if (oldest) {
        this.dismiss(oldest);
      }
    }

    const banner = document.createElement('div');
    banner.className = 'predator-push-banner';
    banner.style.setProperty('--banner-accent', catMeta.color);
    banner.style.setProperty('--banner-glow', catMeta.borderGlow);

    banner.innerHTML = `
      <div class="banner-top-accent"></div>
      <div class="banner-main-row">
        <div class="banner-avatar">
          <span class="banner-icon-symbol">${iconSymbol}</span>
        </div>
        <div class="banner-body-content">
          <div class="banner-meta-header">
            <span class="banner-app-tag">PREDATOR CAMPUS</span>
            <span class="banner-cat-badge">${catMeta.label}</span>
          </div>
          <div class="banner-title">${this.escapeHtml(options.title)}</div>
          <div class="banner-desc">${this.escapeHtml(options.body)}</div>
        </div>
        <button class="banner-close-btn" title="Đóng thông báo">✕</button>
      </div>
      <div class="banner-progress-track">
        <div class="banner-progress-bar"></div>
      </div>
    `;

    // Click behavior
    if (options.onClick) {
      banner.style.cursor = 'pointer';
      banner.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.banner-close-btn')) return;
        options.onClick?.();
        this.dismiss(banner);
      });
    }

    const closeBtn = banner.querySelector('.banner-close-btn');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss(banner);
    });

    container.appendChild(banner);
    this.activeBanners.push(banner);

    // Trigger enter animation
    banner.classList.add('banner-visible');

    // Animate progress bar
    const progressBar = banner.querySelector('.banner-progress-bar') as HTMLElement | null;
    if (progressBar) {
      progressBar.style.transition = `width ${durationMs}ms linear`;
      requestAnimationFrame(() => {
        progressBar.style.width = '0%';
      });
    }

    // Auto dismiss timer
    let autoDismissTimer: any = setTimeout(() => {
      this.dismiss(banner);
    }, durationMs);

    // Pause on hover, resume on mouse leave
    banner.addEventListener('mouseenter', () => {
      clearTimeout(autoDismissTimer);
      if (progressBar) {
        const computedWidth = window.getComputedStyle(progressBar).width;
        progressBar.style.transition = 'none';
        progressBar.style.width = computedWidth;
      }
    });

    banner.addEventListener('mouseleave', () => {
      autoDismissTimer = setTimeout(() => {
        this.dismiss(banner);
      }, 2000);
      if (progressBar) {
        progressBar.style.transition = 'width 2000ms linear';
        progressBar.style.width = '0%';
      }
    });

    return banner;
  }

  public static dismiss(banner: HTMLElement): void {
    if (!banner || !banner.parentElement) return;
    banner.classList.remove('banner-visible');
    banner.classList.add('banner-exit');

    const index = this.activeBanners.indexOf(banner);
    if (index !== -1) {
      this.activeBanners.splice(index, 1);
    }

    setTimeout(() => {
      banner.remove();
    }, 320);
  }

  public static clearAll(): void {
    const list = [...this.activeBanners];
    for (const b of list) {
      this.dismiss(b);
    }
  }

  private static escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
