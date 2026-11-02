document.addEventListener('DOMContentLoaded', () => {
  // Set current year in footer
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Mobile Navigation Toggle
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });

    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('active'));
    });
  }

  // Sticky Navbar background on scroll
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  // Reveal on Scroll
  const revealElements = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('active'));
  }

  // Discord Rich Presence via Lanyard WebSocket.
  // The account must be in the Lanyard Discord server for its data to be available.
  const presenceCard = document.getElementById('discord-presence');
  if (presenceCard) {
    const userId = '1242039694540279838';
    const statusLabels = {
      online: 'En ligne',
      idle: 'Absent',
      dnd: 'Ne pas déranger',
      offline: 'Hors ligne'
    };
    const detail = document.getElementById('discord-detail');
    const name = document.getElementById('discord-name');
    const avatar = document.getElementById('discord-avatar');
    let socket;
    let heartbeat;
    let reconnectTimer;
    let reconnectDelay = 1000;
    let closedByPage = false;

    const renderPresence = data => {
      if (!data) return;
      const user = data.discord_user;
      const status = data.discord_status || 'offline';
      presenceCard.dataset.status = status;

      if (user && name) name.textContent = user.global_name || user.display_name || user.username || 'starlie';
      if (user && avatar) {
        if (user.avatar) {
          const extension = user.avatar.startsWith('a_') ? 'gif' : 'png';
          avatar.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
        } else {
          avatar.src = `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`;
        }
      }

      const activities = Array.isArray(data.activities) ? data.activities : [];
      const spotify = data.spotify || null;
      const gameActivity = activities.find(item => item.type === 0) || null;
      if (detail) {
        const statusText = statusLabels[status] || statusLabels.offline;
        if (spotify && spotify.song && spotify.artist) {
          detail.textContent = `${statusText} · Écoute ${spotify.song} — ${spotify.artist}`;
        } else if (gameActivity) {
          const activityText = [gameActivity.name, gameActivity.details, gameActivity.state].filter(Boolean).join(' — ');
          detail.textContent = activityText ? `${statusText} · ${activityText}` : statusText;
        } else {
          detail.textContent = statusText;
        }
      }
    };

    const connect = () => {
      if (closedByPage) return;
      if (detail && !socket) detail.textContent = 'Connexion au statut Discord…';

      try {
        socket = new WebSocket('wss://api.lanyard.rest/socket');
      } catch (error) {
        scheduleReconnect();
        return;
      }

      socket.addEventListener('open', () => {
        reconnectDelay = 1000;
      });

      socket.addEventListener('message', event => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (error) {
          return;
        }

        if (message.op === 1 && message.d && message.d.heartbeat_interval) {
          clearInterval(heartbeat);
          heartbeat = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ op: 3 }));
            }
          }, message.d.heartbeat_interval);
          socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: userId } }));
        } else if (message.op === 0 && message.t === 'INIT_STATE') {
          renderPresence(message.d);
        } else if (message.op === 0 && message.t === 'PRESENCE_UPDATE') {
          renderPresence(message.d);
        }
      });

      socket.addEventListener('close', () => {
        clearInterval(heartbeat);
        socket = null;
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        if (detail) detail.textContent = 'Statut Discord indisponible — vérifie la connexion Lanyard';
        if (socket) socket.close();
      });
    };

    const scheduleReconnect = () => {
      if (closedByPage || reconnectTimer) return;
      if (detail) detail.textContent = 'Reconnexion au statut Discord…';
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        connect();
      }, reconnectDelay);
    };

    connect();
    window.addEventListener('beforeunload', () => {
      closedByPage = true;
      clearInterval(heartbeat);
      clearTimeout(reconnectTimer);
      if (socket) socket.close();
    });
  }

  // Background Canvas — Subtle Particles / Stars
  const canvas = document.getElementById('starsCanvas');
  if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      let width = canvas.width = window.innerWidth;
      let height = canvas.height = window.innerHeight;
      window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
      });

      const numStars = Math.floor((width * height) / 10000);
      const stars = [];
      for (let i = 0; i < numStars; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: Math.random() * 1.2,
          alpha: Math.random(),
          speed: 0.003 + Math.random() * 0.005
        });
      }

      function renderStars() {
        ctx.clearRect(0, 0, width, height);
        stars.forEach(star => {
          star.alpha += star.speed;
          if (star.alpha > 1 || star.alpha < 0) star.speed = -star.speed;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200, 180, 255, ${Math.max(0, star.alpha * 0.5)})`;
          ctx.fill();
        });
        requestAnimationFrame(renderStars);
      }
      renderStars();
    }
  }
});