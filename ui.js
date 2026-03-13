// ui.js - Enhanced UI interactions
(function() {
    'use strict';

    // Mobile menu toggle with animation
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileNav = document.getElementById('mobileNav');
    
    if (mobileMenuBtn && mobileNav) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileNav.classList.toggle('show');
            mobileMenuBtn.innerHTML = mobileNav.classList.contains('show') 
                ? '<i class="fas fa-times"></i>' 
                : '<i class="fas fa-bars"></i>';
        });
        
        // Close mobile nav when clicking outside
        document.addEventListener('click', (e) => {
            if (!mobileNav.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                mobileNav.classList.remove('show');
                mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
            }
        });
    }
    
    // Search clear button
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    
    if (searchInput && searchClear) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.focus();
            searchClear.style.opacity = '0';
            
            // Hide search results and suggestions
            const searchResults = document.getElementById('searchResults');
            const searchSuggestions = document.getElementById('searchSuggestions');
            if (searchResults) {
                searchResults.classList.remove('show');
            }
            if (searchSuggestions) {
                searchSuggestions.classList.remove('show');
            }
        });
        
        searchInput.addEventListener('input', () => {
            if (searchInput.value.length > 0) {
                searchClear.style.opacity = '1';
            } else {
                searchClear.style.opacity = '0';
            }
        });
    }
    
    // Close modals with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal.show');
            modals.forEach(modal => {
                modal.classList.remove('show');
                if (modal.id === 'trailerModal' && typeof window.closeTrailer === 'function') {
                    window.closeTrailer();
                }
                if (modal.id === 'videoPlayerModal' && typeof window.closeVideoPlayer === 'function') {
                    window.closeVideoPlayer();
                }
            });
            
            // Close mobile search if open
            const searchContainer = document.querySelector('.search-container');
            if (searchContainer && searchContainer.classList.contains('active')) {
                searchContainer.classList.remove('active');
            }
        }
    });
    
    // Prevent body scroll when modal is open
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    if (modal.classList.contains('show')) {
                        document.body.style.overflow = 'hidden';
                    } else {
                        document.body.style.overflow = '';
                    }
                }
            });
        });
        
        observer.observe(modal, { attributes: true });
    });
    
    // Handle image loading errors globally
    document.addEventListener('error', (e) => {
        if (e.target.tagName === 'IMG') {
            e.target.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'450\' viewBox=\'0 0 300 450\'%3E%3Crect width=\'300\' height=\'450\' fill=\'%232f3640\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23ffffff\' font-family=\'Arial\' font-size=\'16\'%3ENo Image%3C/text%3E%3C/svg%3E';
        }
    }, true);
    
    // Lazy loading for images with IntersectionObserver
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        
                        // Add fade-in effect
                        img.style.opacity = '0';
                        img.style.transition = 'opacity 0.3s ease';
                        setTimeout(() => {
                            img.style.opacity = '1';
                        }, 50);
                    }
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px 0px',
            threshold: 0.01
        });
        
        // Observe all images with data-src attribute
        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Header scroll effect with opacity
    let lastScroll = 0;
    const header = document.querySelector('.header');
    
    if (header) {
        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;
            
            if (currentScroll > lastScroll && currentScroll > 100) {
                header.classList.add('hide');
            } else {
                header.classList.remove('hide');
            }
            
            // Add background opacity based on scroll
            const opacity = Math.min(currentScroll / 200, 0.95);
            header.style.backgroundColor = `rgba(10, 15, 20, ${opacity})`;
            
            lastScroll = currentScroll;
        });
    }
    
    // Update active nav link based on scroll position with debounce
    let scrollTimeout;
    function updateActiveNav() {
        const sections = {
            '#home': document.getElementById('heroBanner'),
            '#movies': document.getElementById('allMoviesSection'),
            '#tvshows': document.getElementById('allMoviesSection'),
            '#ai-recommendations': document.getElementById('aiRecommendationsSection')
        };
        
        const scrollPosition = window.scrollY + 200;
        
        for (const [hash, section] of Object.entries(sections)) {
            if (section) {
                const sectionTop = section.offsetTop;
                const sectionBottom = sectionTop + section.offsetHeight;
                
                if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
                    document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === hash) {
                            link.classList.add('active');
                        }
                    });
                }
            }
        }
    }
    
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(updateActiveNav, 100);
    });
    
    // Handle window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            // Close mobile nav on resize to desktop
            if (window.innerWidth > 1024 && mobileNav) {
                mobileNav.classList.remove('show');
                if (mobileMenuBtn) {
                    mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
                }
            }
            
            // Adjust search container on resize
            const searchContainer = document.querySelector('.search-container');
            if (window.innerWidth > 768 && searchContainer) {
                searchContainer.classList.remove('active');
            }
        }, 250);
    });
    
    // Touch event handling for mobile
    if ('ontouchstart' in window) {
        document.querySelectorAll('.movie-card, .suggestion-item, .search-result-item, .slider').forEach(element => {
            element.addEventListener('touchstart', function(e) {
                // Allow default behavior for scrolling
            }, { passive: true });
        });
    }
    
    // Initialize slider grab cursor
    const sliders = document.querySelectorAll('.slider');
    sliders.forEach(slider => {
        let isDown = false;
        let startX;
        let scrollLeft;
        
        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.classList.add('active');
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
        });
        
        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.classList.remove('active');
        });
        
        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.classList.remove('active');
        });
        
        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 2;
            slider.scrollLeft = scrollLeft - walk;
        });
    });
    
    // Add touch support for sliders
    sliders.forEach(slider => {
        let touchStartX = 0;
        let touchScrollLeft = 0;
        
        slider.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].pageX - slider.offsetLeft;
            touchScrollLeft = slider.scrollLeft;
        }, { passive: true });
        
        slider.addEventListener('touchmove', (e) => {
            if (!touchStartX) return;
            const x = e.touches[0].pageX - slider.offsetLeft;
            const walk = (x - touchStartX) * 2;
            slider.scrollLeft = touchScrollLeft - walk;
        }, { passive: true });
        
        slider.addEventListener('touchend', () => {
            touchStartX = 0;
        });
    });
})();