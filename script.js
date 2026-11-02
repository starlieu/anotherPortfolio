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

  // Discord presence via Lanyard. Join discord.gg/lanyard to enable the API.
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

    const renderPresence = data => {
      const user = data.discord_user;
      const status = data.discord_status || 'offline';
      presenceCard.dataset.status = status;
      if (user && name) name.textContent = user.global_name || user.display_name || user.username || 'starlie';
      if (user && avatar && user.avatar) {
        const extension = user.avatar.startsWith('a_') ? 'gif' : 'png';
        avatar.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
      }

      const activity = (data.activities || []).find(item => item.type === 0) || null;
      if (detail) {
        if (activity) {
          const activityText = [activity.name, activity.details, activity.state].filter(Boolean).join(' — ');
          detail.textContent = `${statusLabels[status] || statusLabels.offline} · ${activityText}`;
        } else {
          detail.textContent = statusLabels[status] || statusLabels.offline;
        }
      }
    };

    fetch(`https://api.lanyard.rest/v1/users/${userId}`)
      .then(response => {
        if (!response.ok) throw new Error('Lanyard request failed');
        return response.json();
      })
      .then(result => {
        if (result.success && result.data) renderPresence(result.data);
        else throw new Error('Lanyard user unavailable');
      })
      .catch(() => {
        if (detail) detail.textContent = 'Indisponible — rejoins le serveur Lanyard';
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