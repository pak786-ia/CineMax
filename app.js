// Global variables
let currentPage = 1;
let currentTvPage = 1;
let isLoading = false;
let hasMore = true;
let currentGenre = 'all';
let currentMediaType = 'movie';
let allMovies = [];
let allTVShows = [];
let currentMovieId = null;
let currentVideoTime = 0;
let videoPlayer = null;
let searchTimeout = null;
let backendAvailable = false;
let searchSuggestionTimeout = null;
let currentAudio = null;
let touchStartY = 0;
let touchStartX = 0;
let isScrolling = false;
let scrollTimeout = null;
let currentServerIndex = 0;
let serverRetryCount = 0;
let serverCheckInterval = null;
let currentSources = [];
let currentVideoIframe = null;
let welcomeMessageTimeout = null;
let failedServers = [];
let currentContentInfo = null;

// New content tracking
let newContentIds = new Set();
let newContentExpiry = {};

// Configuration
const APP_CONFIG = {
    TMDB_API_KEY: '3fd2be6f0c70a2a598f084ddfb75487c',
    TMDB_BASE_URL: 'https://api.themoviedb.org/3',
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/',
    BACKEND_URL: 'http://localhost:3005',
    POSTER_SIZES: {
        small: 'w185',
        medium: 'w342',
        large: 'w500',
        original: 'original'
    },
    CACHE_DURATION: 3600000,
    NEW_CONTENT_DAYS: 7, // Days to keep "New" badge
    STORAGE_KEYS: {
        WISHLIST: 'cinemax_wishlist',
        CONTINUE_WATCHING: 'cinemax_continue_watching',
        WATCH_HISTORY: 'cinemax_watch_history',
        CACHE: 'cinemax_cache',
        NEW_CONTENT: 'cinemax_new_content'
    }
};

// Cache system
const cache = {
    get: (key) => {
        const cached = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CACHE);
        if (cached) {
            const data = JSON.parse(cached);
            if (data[key] && Date.now() - data[key].timestamp < APP_CONFIG.CACHE_DURATION) {
                return data[key].value;
            }
        }
        return null;
    },
    set: (key, value) => {
        const cached = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CACHE);
        const data = cached ? JSON.parse(cached) : {};
        data[key] = {
            value,
            timestamp: Date.now()
        };
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CACHE, JSON.stringify(data));
    }
};

// New content management
const newContentManager = {
    init: function() {
        const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.NEW_CONTENT);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                newContentIds = new Set(data.ids || []);
                newContentExpiry = data.expiry || {};
                this.cleanup();
            } catch (e) {
                console.error('Error loading new content:', e);
            }
        }
        
        // Run cleanup every hour
        setInterval(() => this.cleanup(), 3600000);
    },
    
    add: function(contentId, type, releaseDate) {
        const id = `${type}_${contentId}`;
        
        // Check if content is new (within 7 days)
        if (releaseDate) {
            const release = new Date(releaseDate);
            const now = new Date();
            const daysDiff = (now - release) / (1000 * 60 * 60 * 24);
            
            if (daysDiff <= APP_CONFIG.NEW_CONTENT_DAYS) {
                newContentIds.add(id);
                newContentExpiry[id] = Date.now() + (APP_CONFIG.NEW_CONTENT_DAYS * 24 * 60 * 60 * 1000);
                this.save();
            }
        }
    },
    
    check: function(contentId, type) {
        const id = `${type}_${contentId}`;
        return newContentIds.has(id);
    },
    
    cleanup: function() {
        const now = Date.now();
        let changed = false;
        
        for (const [id, expiry] of Object.entries(newContentExpiry)) {
            if (now > expiry) {
                newContentIds.delete(id);
                delete newContentExpiry[id];
                changed = true;
            }
        }
        
        if (changed) {
            this.save();
        }
    },
    
    save: function() {
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.NEW_CONTENT, JSON.stringify({
            ids: Array.from(newContentIds),
            expiry: newContentExpiry
        }));
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    // Show loading screen
    const loadingScreen = document.getElementById('loadingScreen');
    
    // Initialize new content manager
    newContentManager.init();
    
    await initializeApp();
    setupEventListeners();
    setupInfiniteScroll();
    loadWishlist();
    loadContinueWatching();
    setupNavigation();
    setupVideoPlayerControls();
    setupSearchAutocomplete();
    setupMediaTypeToggle();
    setupMobileSearch();
    setupMobileTouchPrevention();
    
    // Start auto-update checker
    setupAutoUpdate();
    
    // Hide loading screen after everything is loaded
    setTimeout(() => {
        if (loadingScreen) loadingScreen.classList.add('hide');
    }, 1500);
});

// Auto-update function - checks for new content every 30 minutes
function setupAutoUpdate() {
    // Check immediately
    checkForNewContent();
    
    // Then check every 30 minutes
    setInterval(checkForNewContent, 30 * 60 * 1000);
}

async function checkForNewContent() {
    try {
        console.log('Checking for new content...');
        
        // Check new movies
        const moviesResponse = await fetch(
            `${APP_CONFIG.TMDB_BASE_URL}/movie/now_playing?api_key=${APP_CONFIG.TMDB_API_KEY}&language=en-US&page=1`
        );
        const moviesData = await moviesResponse.json();
        
        if (moviesData.results) {
            moviesData.results.forEach(movie => {
                newContentManager.add(movie.id, 'movie', movie.release_date);
            });
        }
        
        // Check new TV shows
        const tvResponse = await fetch(
            `${APP_CONFIG.TMDB_BASE_URL}/tv/on_the_air?api_key=${APP_CONFIG.TMDB_API_KEY}&language=en-US&page=1`
        );
        const tvData = await tvResponse.json();
        
        if (tvData.results) {
            tvData.results.forEach(tv => {
                newContentManager.add(tv.id, 'tv', tv.first_air_date);
            });
        }
        
        // Refresh displays to show new badges
        refreshContentDisplays();
        
        showNotification('New content added! Check out the "New" badges.', 'success');
    } catch (error) {
        console.error('Error checking for new content:', error);
    }
}

function refreshContentDisplays() {
    // Refresh trending sections
    loadTrendingMovies();
    loadTrendingTVShows();
    loadPopularWebSeries();
    loadAIRecommendations();
    
    // Refresh all movies and TV shows if they're visible
    if (currentMediaType === 'movie') {
        currentPage = 1;
        hasMore = true;
        document.getElementById('movieGrid').innerHTML = '';
        loadAllMovies(true);
    } else {
        currentTvPage = 1;
        hasMore = true;
        document.getElementById('tvGrid').innerHTML = '';
        loadAllTVShows(true);
    }
}

// Setup mobile touch prevention to avoid accidental clicks while scrolling
function setupMobileTouchPrevention() {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    document.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        isScrolling = false;
        
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!touchStartY) return;
        
        const touchY = e.touches[0].clientY;
        const touchX = e.touches[0].clientX;
        const deltaY = Math.abs(touchY - touchStartY);
        const deltaX = Math.abs(touchX - touchStartX);
        
        if (deltaY > 10 || deltaX > 10) {
            isScrolling = true;
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        scrollTimeout = setTimeout(() => {
            isScrolling = false;
        }, 100);
    });

    document.addEventListener('click', (e) => {
        if (isScrolling) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);
}

// Initialize app
async function initializeApp() {
    try {
        await checkBackendConnection();
        await loadFeaturedContent();
        await loadTrendingMovies();
        await loadTrendingTVShows();
        await loadAIRecommendations();
        await loadAllMovies();
        await loadAllTVShows();
        await loadPopularWebSeries();
    } catch (error) {
        console.error('Error initializing app:', error);
        showNotification('Error loading content. Please refresh the page.', 'error');
    }
}

// Setup mobile search with improved visibility
function setupMobileSearch() {
    const mobileSearchBtn = document.getElementById('mobileSearchBtn');
    const searchInput = document.getElementById('searchInput');
    const searchContainer = document.querySelector('.search-container');
    const searchResults = document.getElementById('searchResults');
    const searchSuggestions = document.getElementById('searchSuggestions');
    
    if (mobileSearchBtn && searchInput && searchContainer) {
        mobileSearchBtn.replaceWith(mobileSearchBtn.cloneNode(true));
        const newMobileSearchBtn = document.getElementById('mobileSearchBtn');
        
        newMobileSearchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            searchContainer.classList.toggle('active');
            
            if (searchContainer.classList.contains('active')) {
                searchInput.focus();
                
                // Adjust position for better visibility
                setTimeout(() => {
                    searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Ensure search results are visible
                    if (searchResults) {
                        searchResults.style.maxHeight = '60vh';
                        searchResults.style.zIndex = '9999';
                    }
                    if (searchSuggestions) {
                        searchSuggestions.style.maxHeight = '60vh';
                        searchSuggestions.style.zIndex = '9999';
                    }
                }, 300);
            }
        });

        newMobileSearchBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            searchContainer.classList.toggle('active');
            
            if (searchContainer.classList.contains('active')) {
                searchInput.focus();
                setTimeout(() => {
                    searchInput.focus();
                    
                    // Adjust position for better visibility
                    searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    if (searchResults) {
                        searchResults.style.maxHeight = '60vh';
                        searchResults.style.zIndex = '9999';
                    }
                    if (searchSuggestions) {
                        searchSuggestions.style.maxHeight = '60vh';
                        searchSuggestions.style.zIndex = '9999';
                    }
                }, 100);
            }
        });
    }
    
    if (searchInput) {
        // Improve input visibility
        searchInput.style.fontSize = '16px'; // Prevents zoom on iOS
        searchInput.style.color = '#ffffff';
        searchInput.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
        
        searchInput.addEventListener('focus', () => {
            setTimeout(() => {
                searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        });
        
        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        searchInput.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        });
        
        // Ensure input text is visible
        searchInput.addEventListener('input', function() {
            this.style.color = '#ffffff';
        });
    }
    
    // Close search when tapping outside with improved handling
    document.addEventListener('click', (e) => {
        const searchContainer = document.querySelector('.search-container');
        const mobileSearchBtn = document.getElementById('mobileSearchBtn');
        const searchResults = document.getElementById('searchResults');
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (searchContainer && mobileSearchBtn) {
            if (!searchContainer.contains(e.target) && !mobileSearchBtn.contains(e.target)) {
                searchContainer.classList.remove('active');
                
                // Hide results but keep them accessible
                if (searchResults) {
                    searchResults.style.display = 'none';
                }
                if (searchSuggestions) {
                    searchSuggestions.style.display = 'none';
                }
            }
        }
    });

    document.addEventListener('touchstart', (e) => {
        const searchContainer = document.querySelector('.search-container');
        const mobileSearchBtn = document.getElementById('mobileSearchBtn');
        const searchResults = document.getElementById('searchResults');
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (searchContainer && mobileSearchBtn) {
            if (!searchContainer.contains(e.target) && !mobileSearchBtn.contains(e.target)) {
                searchContainer.classList.remove('active');
                
                if (searchResults) {
                    searchResults.style.display = 'none';
                }
                if (searchSuggestions) {
                    searchSuggestions.style.display = 'none';
                }
            }
        }
    });
}

// Setup media type toggle
function setupMediaTypeToggle() {
    const movieTab = document.getElementById('movieTab');
    const tvTab = document.getElementById('tvTab');
    const movieGrid = document.getElementById('movieGrid');
    const tvGrid = document.getElementById('tvGrid');
    
    if (movieTab && tvTab && movieGrid && tvGrid) {
        movieTab.addEventListener('click', () => {
            movieTab.classList.add('active');
            tvTab.classList.remove('active');
            movieGrid.style.display = 'grid';
            tvGrid.style.display = 'none';
            currentMediaType = 'movie';
        });

        movieTab.addEventListener('touchstart', (e) => {
            e.preventDefault();
            movieTab.classList.add('active');
            tvTab.classList.remove('active');
            movieGrid.style.display = 'grid';
            tvGrid.style.display = 'none';
            currentMediaType = 'movie';
        });
        
        tvTab.addEventListener('click', () => {
            tvTab.classList.add('active');
            movieTab.classList.remove('active');
            tvGrid.style.display = 'grid';
            movieGrid.style.display = 'none';
            currentMediaType = 'tv';
        });

        tvTab.addEventListener('touchstart', (e) => {
            e.preventDefault();
            tvTab.classList.add('active');
            movieTab.classList.remove('active');
            tvGrid.style.display = 'grid';
            movieGrid.style.display = 'none';
            currentMediaType = 'tv';
        });
    }
}

// Check backend connection
async function checkBackendConnection() {
    try {
        const possiblePorts = [3005, 3000, 3001, 3002, 3003, 3004];
        
        for (const port of possiblePorts) {
            try {
                const url = `${window.location.protocol}//${window.location.hostname}:${port}/health`;
                const response = await fetch(url, { 
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(2000)
                });
                
                if (response.ok) {
                    APP_CONFIG.BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:${port}`;
                    backendAvailable = true;
                    console.log(`✅ Backend connected successfully on port ${port}`);
                    return;
                }
            } catch (e) {
                // Try next port
            }
        }
        
        console.warn('⚠️ Backend not available. Using free streaming sources.');
        backendAvailable = false;
    } catch (error) {
        console.warn('⚠️ Backend not available. Using free streaming sources.');
        backendAvailable = false;
    }
}

// Load featured content
async function loadFeaturedContent() {
    try {
        const isMovie = Math.random() > 0.5;
        
        if (isMovie) {
            const response = await fetch(
                `${APP_CONFIG.TMDB_BASE_URL}/movie/popular?api_key=${APP_CONFIG.TMDB_API_KEY}&language=en-US&page=1`
            );
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                const featured = data.results[0];
                updateHeroBanner(featured, 'movie');
            }
        } else {
            const response = await fetch(
                `${APP_CONFIG.TMDB_BASE_URL}/tv/popular?api_key=${APP_CONFIG.TMDB_API_KEY}&language=en-US&page=1`
            );
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                const featured = data.results[0];
                updateHeroBanner(featured, 'tv');
            }
        }
    } catch (error) {
        console.error('Error loading featured content:', error);
        document.getElementById('heroTitle').textContent = 'Welcome to CineMax';
        document.getElementById('heroDesc').textContent = 'Discover thousands of movies and TV shows from around the world';
    }
}

// Update hero banner
function updateHeroBanner(item, type) {
    const heroBanner = document.getElementById('heroBanner');
    const heroTitle = document.getElementById('heroTitle');
    const heroDesc = document.getElementById('heroDesc');
    
    if (!heroBanner || !heroTitle || !heroDesc) return;
    
    const title = item.title || item.name;
    const backdrop = item.backdrop_path || item.poster_path;
    const posterUrl = backdrop 
        ? `${APP_CONFIG.TMDB_IMAGE_BASE}${APP_CONFIG.POSTER_SIZES.original}${backdrop}`
        : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1920\' height=\'1080\' viewBox=\'0 0 1920 1080\'%3E%3Crect width=\'1920\' height=\'1080\' fill=\'%23192a56\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23ffffff\' font-family=\'Arial\' font-size=\'48\'%3EFeatured Content%3C/text%3E%3C/svg%3E';
    
    heroBanner.style.backgroundImage = `url(${posterUrl})`;
    heroTitle.textContent = title;
    heroDesc.textContent = item.overview ? item.overview.substring(0, 150) + '...' : 'No description available';
    
    heroBanner.dataset.contentId = item.id;
    heroBanner.dataset.contentType = type;
    heroBanner.dataset.contentData = JSON.stringify(item);
}

// Load trending movies
async function loadTrendingMovies() {
    try {
        const response = await fetch(
            `${APP_CONFIG.TMDB_BASE_URL}/trending/movie/week?api_key=${APP_CONFIG.TMDB_API_KEY}`
        );
        const data = await response.json();
        displayMoviesInSlider(data.results, 'trendingSlider', 'movie');
    } catch (error) {
        console.error('Error loading trending movies:', error);
        const slider = document.getElementById('trendingSlider');
        if (slider) slider.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Unable to load trending movies</p>';
    }
}

// Load trending TV shows
async function loadTrendingTVShows() {
    try {
        const response = await fetch(
            `${APP_CONFIG.TMDB_BASE_URL}/trending/tv/week?api_key=${APP_CONFIG.TMDB_API_KEY}`
        );
        const data = await response.json();
        displayMoviesInSlider(data.results, 'trendingTVSlider', 'tv');
    } catch (error) {
        console.error('Error loading trending TV shows:', error);
        const slider = document.getElementById('trendingTVSlider');
        if (slider) slider.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Unable to load trending TV shows</p>';
    }
}

// Load popular web series
async function loadPopularWebSeries() {
    try {
        const response = await fetch(
            `${APP_CONFIG.TMDB_BASE_URL}/discover/tv?api_key=${APP_CONFIG.TMDB_API_KEY}&with_original_language=en&sort_by=popularity.desc&with_genres=18,10765`
        );
        const data = await response.json();
        displayMoviesInSlider(data.results, 'webSeriesSlider', 'tv');
    } catch (error) {
        console.error('Error loading web series:', error);
        const slider = document.getElementById('webSeriesSlider');
        if (slider) slider.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Unable to load web series</p>';
    }
}

// Load AI recommendations
async function loadAIRecommendations() {
    try {
        const history = getWatchHistory();
        let recommendations = [];
        
        if (history.length > 0) {
            const randomId = history[Math.floor(Math.random() * history.length)];
            
            if (randomId) {
                const response = await fetch(
                    `${APP_CONFIG.TMDB_BASE_URL}/movie/${randomId}/similar?api_key=${APP_CONFIG.TMDB_API_KEY}`
                );
                const data = await response.json();
                recommendations = data.results.slice(0, 10);
            }
        }
        
        if (recommendations.length === 0) {
            const response = await fetch(
                `${APP_CONFIG.TMDB_BASE_URL}/movie/top_rated?api_key=${APP_CONFIG.TMDB_API_KEY}&language=en-US&page=1`
            );
            const data = await response.json();
            recommendations = data.results.slice(0, 10);
        }
        
        displayMoviesInSlider(recommendations, 'aiRecommendationsSlider', 'movie');
    } catch (error) {
        console.error('Error loading AI recommendations:', error);
        const slider = document.getElementById('aiRecommendationsSlider');
        if (slider) slider.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Unable to load recommendations</p>';
    }
}

// Load all movies
async function loadAllMovies(reset = false) {
    if (isLoading || !hasMore) return;
    
    isLoading = true;
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.style.display = 'block';
    
    try {
        let url;
        if (currentGenre === 'all') {
            url = `${APP_CONFIG.TMDB_BASE_URL}/discover/movie?api_key=${APP_CONFIG.TMDB_API_KEY}&language=en-US&sort_by=popularity.desc&page=${currentPage}`;
        } else {
            const genreMap = {
                'action': 28, 'comedy': 35, 'drama': 18, 'sci-fi': 878, 'horror': 27,
                'romance': 10749, 'thriller': 53, 'documentary': 99, 'animation': 16,
                'adventure': 12, 'fantasy': 14, 'mystery': 9648, 'crime': 80,
                'family': 10751, 'war': 10752, 'history': 36, 'music': 10402, 'western': 37
            };
            const genreId = genreMap[currentGenre];
            url = `${APP_CONFIG.TMDB_BASE_URL}/discover/movie?api_key=${APP_CONFIG.TMDB_API_KEY}&with_genres=${genreId}&page=${currentPage}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (reset) {
            allMovies = data.results;
            const movieGrid = document.getElementById('movieGrid');
            if (movieGrid) movieGrid.innerHTML = '';
        } else {
            allMovies = [...allMovies, ...data.results];
        }
        
        displayMoviesInGrid(data.results, 'movieGrid', 'movie');
        
        currentPage++;
        hasMore = data.page < data.total_pages;
        const movieCount = document.getElementById('movieCount');
        if (movieCount) movieCount.textContent = `(${allMovies.length} movies)`;
    } catch (error) {
        console.error('Error loading movies:', error);
        hasMore = false;
        const movieGrid = document.getElementById('movieGrid');
        if (movieGrid) movieGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">Unable to load movies. Please check your connection.</p>';
    } finally {
        isLoading = false;
        if (spinner) spinner.style.display = 'none';
    }
}

// Load all TV shows
async function loadAllTVShows(reset = false) {
    if (isLoading || !hasMore) return;
    
    isLoading = true;
    const spinner = document.getElementById('tvLoadingSpinner');
    if (spinner) spinner.style.display = 'block';
    
    try {
        let url;
        if (currentGenre === 'all') {
            url = `${APP_CONFIG.TMDB_BASE_URL}/discover/tv?api_key=${APP_CONFIG.TMDB_API_KEY}&language=en-US&sort_by=popularity.desc&page=${currentTvPage}`;
        } else {
            const genreMap = {
                'action': 10759, 'comedy': 35, 'drama': 18, 'sci-fi': 10765, 'horror': 9648,
                'romance': 10749, 'thriller': 80, 'documentary': 99, 'animation': 16,
                'adventure': 10759, 'fantasy': 10765, 'mystery': 9648, 'crime': 80,
                'family': 10751, 'war': 10768, 'history': 36, 'music': 10402, 'western': 37
            };
            const genreId = genreMap[currentGenre];
            url = `${APP_CONFIG.TMDB_BASE_URL}/discover/tv?api_key=${APP_CONFIG.TMDB_API_KEY}&with_genres=${genreId}&page=${currentTvPage}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (reset) {
            allTVShows = data.results;
            const tvGrid = document.getElementById('tvGrid');
            if (tvGrid) tvGrid.innerHTML = '';
        } else {
            allTVShows = [...allTVShows, ...data.results];
        }
        
        displayMoviesInGrid(data.results, 'tvGrid', 'tv');
        
        currentTvPage++;
        hasMore = data.page < data.total_pages;
    } catch (error) {
        console.error('Error loading TV shows:', error);
        hasMore = false;
        const tvGrid = document.getElementById('tvGrid');
        if (tvGrid) tvGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">Unable to load TV shows. Please check your connection.</p>';
    } finally {
        isLoading = false;
        if (spinner) spinner.style.display = 'none';
    }
}

// Display movies in slider with proper event listeners
function displayMoviesInSlider(items, containerId, type = 'movie') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No content available</p>';
        return;
    }
    
    // Clear container first
    container.innerHTML = '';
    
    // Create and append each card individually
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.dataset.contentId = item.id;
        card.dataset.contentType = type;
        card.dataset.releaseDate = item.release_date || item.first_air_date || '';
        
        // Check if content is new
        const isNew = newContentManager.check(item.id, type);
        
        card.innerHTML = createContentCard(item, type, isNew);
        container.appendChild(card);
        
        let touchMoved = false;
        
        card.addEventListener('touchstart', (e) => {
            touchMoved = false;
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
            if (!touchStartY) return;
            
            const touchY = e.touches[0].clientY;
            const touchX = e.touches[0].clientX;
            const deltaY = Math.abs(touchY - touchStartY);
            const deltaX = Math.abs(touchX - touchStartX);
            
            if (deltaY > 10 || deltaX > 10) {
                touchMoved = true;
            }
        }, { passive: true });

        card.addEventListener('touchend', (e) => {
            e.preventDefault();
            
            if (!touchMoved && !isScrolling) {
                const contentId = card.dataset.contentId;
                const contentType = card.dataset.contentType;
                showContentDetails(contentId, contentType);
            }
        });

        card.addEventListener('click', (e) => {
            if (isScrolling) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            
            const contentId = card.dataset.contentId;
            const contentType = card.dataset.contentType;
            showContentDetails(contentId, contentType);
        });
    });
}

// Display movies in grid with touch prevention
function displayMoviesInGrid(items, gridId, type = 'movie') {
    const grid = document.getElementById(gridId);
    if (!grid || !items || items.length === 0) return;
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.dataset.contentId = item.id;
        card.dataset.contentType = type;
        card.dataset.releaseDate = item.release_date || item.first_air_date || '';
        
        // Check if content is new
        const isNew = newContentManager.check(item.id, type);
        
        card.innerHTML = createContentCard(item, type, isNew);
        grid.appendChild(card);
        
        let touchMoved = false;
        
        card.addEventListener('touchstart', (e) => {
            touchMoved = false;
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
            if (!touchStartY) return;
            
            const touchY = e.touches[0].clientY;
            const touchX = e.touches[0].clientX;
            const deltaY = Math.abs(touchY - touchStartY);
            const deltaX = Math.abs(touchX - touchStartX);
            
            if (deltaY > 10 || deltaX > 10) {
                touchMoved = true;
            }
        }, { passive: true });

        card.addEventListener('touchend', (e) => {
            e.preventDefault();
            
            if (!touchMoved && !isScrolling) {
                showContentDetails(item.id, type);
            }
        });

        card.addEventListener('click', (e) => {
            if (isScrolling) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            showContentDetails(item.id, type);
        });
    });
}

// Create content card HTML with "New" badge
function createContentCard(item, type = 'movie', isNew = false) {
    const title = item.title || item.name || 'Unknown';
    const posterPath = item.poster_path 
        ? `${APP_CONFIG.TMDB_IMAGE_BASE}${APP_CONFIG.POSTER_SIZES.medium}${item.poster_path}`
        : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'450\' viewBox=\'0 0 300 450\'%3E%3Crect width=\'300\' height=\'450\' fill=\'%23192a56\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23ffffff\' font-family=\'Arial\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E';
    
    const year = item.release_date ? item.release_date.split('-')[0] : (item.first_air_date ? item.first_air_date.split('-')[0] : 'N/A');
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const typeIcon = type === 'movie' ? '🎬' : '📺';
    
    const newBadge = isNew ? '<span class="new-badge">NEW</span>' : '';
    
    return `
        <img class="movie-poster" src="${posterPath}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'450\' viewBox=\'0 0 300 450\'%3E%3Crect width=\'300\' height=\'450\' fill=\'%23192a56\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23ffffff\' font-family=\'Arial\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E'">
        ${newBadge}
        <div class="movie-info">
            <div class="movie-title">${title}</div>
            <div class="movie-year">${year} ${typeIcon}</div>
        </div>
        <div class="movie-rating">
            <i class="fas fa-star" style="color: var(--accent);"></i> ${rating}
        </div>
    `;
}

// Show content details with episode selector for TV shows
async function showContentDetails(contentId, type = 'movie') {
    try {
        const endpoint = type === 'movie' ? 'movie' : 'tv';
        const response = await fetch(
            `${APP_CONFIG.TMDB_BASE_URL}/${endpoint}/${contentId}?api_key=${APP_CONFIG.TMDB_API_KEY}&append_to_response=credits,videos,similar`
        );
        const content = await response.json();
        
        const modalBody = document.getElementById('modalBody');
        if (!modalBody) return;
        
        const posterUrl = content.poster_path 
            ? `${APP_CONFIG.TMDB_IMAGE_BASE}${APP_CONFIG.POSTER_SIZES.large}${content.poster_path}`
            : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'500\' height=\'750\' viewBox=\'0 0 500 750\'%3E%3Crect width=\'500\' height=\'750\' fill=\'%23192a56\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23ffffff\' font-family=\'Arial\' font-size=\'24\'%3ENo Poster%3C/text%3E%3C/svg%3E';
        
        const trailer = content.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
        const cast = content.credits?.cast?.slice(0, 8) || [];
        const title = content.title || content.name;
        const releaseDate = content.release_date || content.first_air_date;
        const year = releaseDate ? releaseDate.split('-')[0] : 'N/A';
        const runtime = content.runtime ? content.runtime + ' min' : (content.episode_run_time ? content.episode_run_time[0] + ' min/ep' : 'N/A');
        const voteAverage = content.vote_average ? content.vote_average.toFixed(1) : 'N/A';
        const typeIcon = type === 'movie' ? '🎬 Movie' : '📺 TV Series';
        const seasons = content.seasons || [];
        
        // Check if content is new
        const isNew = newContentManager.check(contentId, type);
        const newBadge = isNew ? '<span class="new-badge-large">NEW RELEASE</span>' : '';
        
        // Create episode selector HTML for TV shows
        let episodeSelectorHTML = '';
        if (type === 'tv' && seasons.length > 0) {
            episodeSelectorHTML = `
                <div style="margin: 20px 0; background: var(--surface); padding: 15px; border-radius: 10px;">
                    <h3 style="color: var(--text); margin-bottom: 15px;">Select Season & Episode</h3>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <select id="seasonSelect" style="padding: 12px; background: var(--secondary); color: white; border: 2px solid var(--primary); border-radius: 5px; flex: 1; font-size: 16px; cursor: pointer;">
                            <option value="" style="background: var(--secondary); color: white;">-- Select Season --</option>
                            ${seasons.filter(s => s.season_number > 0).map(season => `
                                <option value="${season.season_number}" data-episodes="${season.episode_count || 0}" style="background: var(--secondary); color: white;">
                                    ${season.name || `Season ${season.season_number}`} (${season.episode_count || 0} episodes)
                                </option>
                            `).join('')}
                        </select>
                        
                        <select id="episodeSelect" style="padding: 12px; background: var(--secondary); color: white; border: 2px solid var(--primary); border-radius: 5px; flex: 1; font-size: 16px; cursor: pointer;" disabled>
                            <option value="" style="background: var(--secondary); color: white;">-- Select Episode --</option>
                        </select>
                        
                        <button id="playSelectedBtn" class="btn btn-primary" style="padding: 12px 20px; background: var(--primary); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; display: none;">
                            <i class="fas fa-play"></i> Play Selected
                        </button>
                    </div>
                </div>
            `;
        }
        
        modalBody.innerHTML = `
            <div class="movie-detail">
                <img class="movie-detail-poster" src="${posterUrl}" alt="${title}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'500\' height=\'750\' viewBox=\'0 0 500 750\'%3E%3Crect width=\'500\' height=\'750\' fill=\'%23192a56\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23ffffff\' font-family=\'Arial\' font-size=\'24\'%3ENo Poster%3C/text%3E%3C/svg%3E'">
                <div class="movie-detail-info">
                    <h2 style="color: var(--text);">${title} <span style="font-size: 16px; color: var(--primary);">${typeIcon}</span> ${newBadge}</h2>
                    <div class="movie-meta">
                        <span>${year}</span>
                        <span>${runtime}</span>
                        <span><i class="fas fa-star" style="color: var(--accent);"></i> ${voteAverage}</span>
                    </div>
                    <div class="movie-genres">
                        ${content.genres ? content.genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('') : ''}
                    </div>
                    <p class="movie-description" style="color: var(--text-secondary);">${content.overview || 'No description available.'}</p>
                    
                    ${episodeSelectorHTML}
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                        <button class="btn btn-primary" id="watchNowDetailBtn">
                            <i class="fas fa-play"></i> Watch Now
                        </button>
                        ${trailer ? `
                            <button class="btn btn-secondary" id="trailerDetailBtn">
                                <i class="fas fa-film"></i> Trailer
                            </button>
                        ` : ''}
                        <button class="btn btn-outline" id="wishlistDetailBtn">
                            <i class="fas fa-heart"></i> Wishlist
                        </button>
                    </div>
                    
                    <div class="cast-section">
                        <h3 style="color: var(--text);">Cast</h3>
                        <div class="cast-grid">
                            ${cast.map(actor => `
                                <div class="cast-item">
                                    <img class="cast-image" src="${actor.profile_path ? `${APP_CONFIG.TMDB_IMAGE_BASE}w185${actor.profile_path}` : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'80\' height=\'80\' viewBox=\'0 0 80 80\'%3E%3Ccircle cx=\'40\' cy=\'40\' r=\'40\' fill=\'%23333\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23fff\' font-size=\'12\'%3ENo Image%3C/text%3E%3C/svg%3E'}" alt="${actor.name}">
                                    <div class="cast-name">${actor.name}</div>
                                    <div class="cast-character">${actor.character || ''}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const watchNowBtn = document.getElementById('watchNowDetailBtn');
        if (watchNowBtn) {
            watchNowBtn.addEventListener('click', () => {
                if (type === 'movie') {
                    playContent(contentId, type);
                } else {
                    const seasonSelect = document.getElementById('seasonSelect');
                    const episodeSelect = document.getElementById('episodeSelect');
                    
                    if (seasonSelect && episodeSelect && seasonSelect.value && episodeSelect.value) {
                        playContent(contentId, type, seasonSelect.value, episodeSelect.value);
                    } else {
                        playContent(contentId, type, 1, 1);
                    }
                }
                const modal = document.getElementById('movieModal');
                if (modal) modal.classList.remove('show');
            });

            watchNowBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (type === 'movie') {
                    playContent(contentId, type);
                } else {
                    const seasonSelect = document.getElementById('seasonSelect');
                    const episodeSelect = document.getElementById('episodeSelect');
                    
                    if (seasonSelect && episodeSelect && seasonSelect.value && episodeSelect.value) {
                        playContent(contentId, type, seasonSelect.value, episodeSelect.value);
                    } else {
                        playContent(contentId, type, 1, 1);
                    }
                }
                const modal = document.getElementById('movieModal');
                if (modal) modal.classList.remove('show');
            });
        }
        
        const trailerBtn = document.getElementById('trailerDetailBtn');
        if (trailerBtn && trailer) {
            trailerBtn.addEventListener('click', () => playTrailer(trailer.key));
            trailerBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                playTrailer(trailer.key);
            });
        }
        
        const wishlistBtn = document.getElementById('wishlistDetailBtn');
        if (wishlistBtn) {
            wishlistBtn.addEventListener('click', () => {
                toggleWishlist(contentId, title, posterUrl, type);
            });
            wishlistBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                toggleWishlist(contentId, title, posterUrl, type);
            });
        }
        
        if (type === 'tv') {
            setupEpisodeSelector(contentId, type);
        }
        
        const modal = document.getElementById('movieModal');
        if (modal) modal.classList.add('show');
    } catch (error) {
        console.error('Error loading content details:', error);
        showNotification('Error loading details', 'error');
    }
}

// Setup episode selector
function setupEpisodeSelector(contentId, type) {
    const seasonSelect = document.getElementById('seasonSelect');
    const episodeSelect = document.getElementById('episodeSelect');
    const playSelectedBtn = document.getElementById('playSelectedBtn');
    
    if (seasonSelect && episodeSelect) {
        let selectedSeason = null;
        let selectedEpisode = null;
        
        seasonSelect.addEventListener('change', async (e) => {
            const seasonNumber = e.target.value;
            selectedSeason = seasonNumber;
            
            if (!seasonNumber) {
                episodeSelect.disabled = true;
                episodeSelect.innerHTML = '<option value="" style="background: var(--secondary); color: white;">-- Select Episode --</option>';
                if (playSelectedBtn) playSelectedBtn.style.display = 'none';
                return;
            }
            
            try {
                showNotification(`Loading Season ${seasonNumber} episodes...`, 'info');
                
                const response = await fetch(
                    `${APP_CONFIG.TMDB_BASE_URL}/tv/${contentId}/season/${seasonNumber}?api_key=${APP_CONFIG.TMDB_API_KEY}`
                );
                
                if (!response.ok) {
                    throw new Error('Failed to load episodes');
                }
                
                const seasonData = await response.json();
                
                episodeSelect.disabled = false;
                
                let episodeOptions = '<option value="" style="background: var(--secondary); color: white;">-- Select Episode --</option>';
                
                if (seasonData.episodes && seasonData.episodes.length > 0) {
                    episodeOptions += seasonData.episodes.map(ep => 
                        `<option value="${ep.episode_number}" style="background: var(--secondary); color: white;">
                            Episode ${ep.episode_number}: ${ep.name || `Episode ${ep.episode_number}`}
                        </option>`
                    ).join('');
                }
                
                episodeSelect.innerHTML = episodeOptions;
                
                if (playSelectedBtn) playSelectedBtn.style.display = 'none';
                
                if (selectedEpisode) {
                    episodeSelect.value = selectedEpisode;
                    if (selectedEpisode && playSelectedBtn) {
                        playSelectedBtn.style.display = 'block';
                    }
                }
                
            } catch (error) {
                console.error('Error loading episodes:', error);
                showNotification('Error loading episodes', 'error');
                episodeSelect.disabled = true;
                episodeSelect.innerHTML = '<option value="" style="background: var(--secondary); color: white;">Failed to load episodes</option>';
            }
        });

        seasonSelect.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        });
        
        episodeSelect.addEventListener('change', (e) => {
            selectedEpisode = e.target.value;
            
            if (playSelectedBtn) {
                if (selectedSeason && selectedEpisode) {
                    playSelectedBtn.style.display = 'block';
                } else {
                    playSelectedBtn.style.display = 'none';
                }
            }
        });

        episodeSelect.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        });
        
        if (playSelectedBtn) {
            playSelectedBtn.addEventListener('click', () => {
                if (selectedSeason && selectedEpisode) {
                    playContent(contentId, type, selectedSeason, selectedEpisode);
                    const modal = document.getElementById('movieModal');
                    if (modal) modal.classList.remove('show');
                } else {
                    showNotification('Please select both season and episode', 'warning');
                }
            });

            playSelectedBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (selectedSeason && selectedEpisode) {
                    playContent(contentId, type, selectedSeason, selectedEpisode);
                    const modal = document.getElementById('movieModal');
                    if (modal) modal.classList.remove('show');
                } else {
                    showNotification('Please select both season and episode', 'warning');
                }
            });
        }
    }
}

// Function to get ALL 6 video sources for movies
function getRealMovieSource(movieId, title, year) {
    return [
        `https://vidsrc.to/embed/movie/${movieId}`,
        `https://www.2embed.cc/embed/${movieId}`,
        `https://vidsrc.icu/embed/movie/${movieId}`,
        `https://autoembed.cc/embed/movie/${movieId}`,
        `https://vidsrc.pro/embed/movie/${movieId}`,
        `https://embed.su/embed/movie/${movieId}`
    ];
}

// Function to get ALL 6 video sources for TV shows
function getRealTVSource(tvId, season = 1, episode = 1) {
    return [
        `https://vidsrc.to/embed/tv/${tvId}/${season}/${episode}`,
        `https://www.2embed.cc/embedtv/${tvId}&s=${season}&e=${episode}`,
        `https://vidsrc.icu/embed/tv/${tvId}/${season}/${episode}`,
        `https://autoembed.cc/embed/tv/${tvId}/${season}/${episode}`,
        `https://vidsrc.pro/embed/tv/${tvId}/${season}/${episode}`,
        `https://embed.su/embed/tv/${tvId}/${season}/${episode}`
    ];
}

// Show welcome message on video player
function showWelcomeMessage(container) {
    const isMobile = window.innerWidth <= 768;
    
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'welcome-message';
    welcomeDiv.style.cssText = `
        position: absolute;
        top: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, rgba(0, 168, 255, 0.95), rgba(0, 102, 255, 0.95));
        color: white;
        padding: ${isMobile ? '12px 20px' : '15px 30px'};
        border-radius: 50px;
        text-align: center;
        z-index: 1000;
        backdrop-filter: blur(10px);
        border: 2px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        animation: slideDown 0.5s ease;
        font-size: ${isMobile ? '13px' : '15px'};
        font-weight: 500;
        max-width: ${isMobile ? '300px' : '600px'};
        width: auto;
        white-space: ${isMobile ? 'normal' : 'nowrap'};
        pointer-events: none;
        border-left: 4px solid #ffd700;
    `;
    
    const icon = isMobile ? '📱' : '💻';
    
    welcomeDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; justify-content: center;">
            <span style="font-size: ${isMobile ? '18px' : '22px'};">${icon}</span>
            <span style="flex: 1;">⚠️ If server won't load, select another from the dropdown below ⚠️</span>
            <span style="font-size: ${isMobile ? '18px' : '22px'};">🎬</span>
        </div>
        <div style="font-size: ${isMobile ? '10px' : '12px'}; margin-top: 5px; opacity: 0.9;">
            This message auto-hides in 10 seconds
        </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translate(-50%, -20px);
            }
            to {
                opacity: 1;
                transform: translate(-50%, 0);
            }
        }
        .welcome-message {
            transition: all 0.3s ease;
        }
        .welcome-message.fade-out {
            opacity: 0;
            transform: translate(-50%, -20px);
        }
    `;
    document.head.appendChild(style);
    
    container.appendChild(welcomeDiv);
    
    welcomeMessageTimeout = setTimeout(() => {
        welcomeDiv.classList.add('fade-out');
        setTimeout(() => {
            if (welcomeDiv.parentNode) {
                welcomeDiv.remove();
            }
        }, 500);
    }, 10000);
}

// Check if iframe loaded successfully
function setupIframeErrorHandling(iframe, sources, container) {
    let currentSourceIndex = 0;
    let retryCount = 0;
    const maxRetries = sources.length;
    
    showWelcomeMessage(container);
    
    const statusDiv = document.createElement('div');
    statusDiv.className = 'server-status';
    statusDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 20px 30px;
        border-radius: 15px;
        text-align: center;
        z-index: 100;
        backdrop-filter: blur(10px);
        border: 2px solid var(--primary);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        animation: fadeIn 0.3s ease;
        pointer-events: none;
    `;
    
    const spinner = document.createElement('div');
    spinner.className = 'server-spinner';
    spinner.style.cssText = `
        width: 40px;
        height: 40px;
        border: 4px solid rgba(255,255,255,0.3);
        border-top: 4px solid var(--primary);
        border-radius: 50%;
        margin: 0 auto 15px;
        animation: spin 1s linear infinite;
    `;
    
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
        font-size: 18px;
        margin-bottom: 10px;
        font-weight: bold;
        color: var(--primary);
    `;
    
    const subMessageEl = document.createElement('div');
    subMessageEl.style.cssText = `
        font-size: 14px;
        color: rgba(255,255,255,0.8);
    `;
    
    statusDiv.appendChild(spinner);
    statusDiv.appendChild(messageEl);
    statusDiv.appendChild(subMessageEl);
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translate(-50%, -40%); }
            to { opacity: 1; transform: translate(-50%, -50%); }
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.6; }
            100% { opacity: 1; }
        }
        .server-progress-bar {
            width: 100%;
            height: 4px;
            background: rgba(255,255,255,0.2);
            border-radius: 2px;
            margin-top: 15px;
            overflow: hidden;
        }
        .server-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--primary), var(--accent));
            transition: width 0.3s ease;
            animation: pulse 2s infinite;
        }
    `;
    document.head.appendChild(style);
    
    container.appendChild(statusDiv);
    
    messageEl.textContent = `🔄 Connecting to Server ${currentSourceIndex + 1}`;
    subMessageEl.textContent = `Trying to establish connection...`;
    
    const progressBar = document.createElement('div');
    progressBar.className = 'server-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'server-progress-fill';
    progressBar.appendChild(progressFill);
    statusDiv.appendChild(progressBar);
    
    function updateStatus(index, status, errorMsg = '') {
        const serverNum = index + 1;
        messageEl.textContent = status;
        
        if (status.includes('Failed')) {
            spinner.style.borderTopColor = '#ff4757';
            messageEl.style.color = '#ff4757';
            subMessageEl.textContent = `Server ${serverNum} failed. ${errorMsg}`;
        } else if (status.includes('Switching')) {
            spinner.style.borderTopColor = '#ffa502';
            messageEl.style.color = '#ffa502';
            subMessageEl.textContent = `Moving to Server ${serverNum}...`;
        } else if (status.includes('Connected')) {
            spinner.style.borderTopColor = '#00d25b';
            messageEl.style.color = '#00d25b';
            subMessageEl.textContent = `Successfully connected to Server ${serverNum}`;
            setTimeout(() => {
                statusDiv.remove();
            }, 2000);
        } else {
            spinner.style.borderTopColor = 'var(--primary)';
            messageEl.style.color = 'var(--primary)';
            subMessageEl.textContent = `Attempting to connect to Server ${serverNum}...`;
        }
        
        progressFill.style.width = `${((index + 1) / sources.length) * 100}%`;
    }
    
    function tryNextServer() {
        if (currentSourceIndex < sources.length - 1) {
            currentSourceIndex++;
            retryCount = 0;
            
            updateStatus(currentSourceIndex, `🔄 Switching to Server ${currentSourceIndex + 1}...`);
            
            setTimeout(() => {
                iframe.src = sources[currentSourceIndex];
            }, 1000);
        } else {
            updateStatus(currentSourceIndex, '❌ All Servers Failed', 'Please try again later');
            showNotification('All streaming servers failed. Please try again later.', 'error');
        }
    }
    
    iframe.addEventListener('load', () => {
        setTimeout(() => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc && iframeDoc.body) {
                    const bodyText = iframeDoc.body.innerText || '';
                    const bodyHTML = iframeDoc.body.innerHTML || '';
                    
                    if (bodyText.includes('404') || bodyText.includes('Not Found') || 
                        bodyText.includes('Error') || bodyText.includes('Failed') ||
                        bodyHTML.includes('404') || bodyHTML.includes('not found') ||
                        bodyText.includes('File not found') || bodyText.includes('Video not found') ||
                        bodyText.includes('Video is unavailable') || bodyText.includes('Video removed')) {
                        
                        console.log(`Server ${currentSourceIndex + 1} returned error page`);
                        updateStatus(currentSourceIndex, `❌ Server ${currentSourceIndex + 1} Failed`, 'Video not available');
                        tryNextServer();
                    } else {
                        updateStatus(currentSourceIndex, `✅ Connected to Server ${currentSourceIndex + 1}`, '');
                        
                        const serverSelector = document.getElementById('serverSelector');
                        if (serverSelector) {
                            serverSelector.value = sources[currentSourceIndex];
                        }
                    }
                } else {
                    updateStatus(currentSourceIndex, `✅ Connected to Server ${currentSourceIndex + 1}`, '');
                    
                    const serverSelector = document.getElementById('serverSelector');
                    if (serverSelector) {
                        serverSelector.value = sources[currentSourceIndex];
                    }
                }
            } catch (e) {
                updateStatus(currentSourceIndex, `✅ Connected to Server ${currentSourceIndex + 1}`, '');
                
                const serverSelector = document.getElementById('serverSelector');
                if (serverSelector) {
                    serverSelector.value = sources[currentSourceIndex];
                }
            }
        }, 2000);
    });
    
    iframe.addEventListener('error', () => {
        console.log(`Server ${currentSourceIndex + 1} failed to load`);
        updateStatus(currentSourceIndex, `❌ Server ${currentSourceIndex + 1} Failed`, 'Connection error');
        tryNextServer();
    });
    
    updateStatus(0, `🔄 Connecting to Server 1...`);
}

// Play content
async function playContent(contentId, type = 'movie', season = 1, episode = 1) {
    try {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        
        if (welcomeMessageTimeout) {
            clearTimeout(welcomeMessageTimeout);
        }
        
        showNotification('Loading real movie stream...', 'info');
        
        const videoContainer = document.getElementById('videoContainer');
        if (!videoContainer) return;
        
        const endpoint = type === 'movie' ? 'movie' : 'tv';
        const response = await fetch(
            `${APP_CONFIG.TMDB_BASE_URL}/${endpoint}/${contentId}?api_key=${APP_CONFIG.TMDB_API_KEY}`
        );
        const content = await response.json();
        const title = content.title || content.name;
        
        let sources = [];
        if (type === 'movie') {
            sources = getRealMovieSource(contentId, title, content.release_date?.split('-')[0]);
        } else {
            sources = getRealTVSource(contentId, season, episode);
        }
        
        currentSources = sources;
        
        const sourcesHtml = sources.map((src, index) => 
            `<option value="${src}" style="background: var(--secondary); color: white;">Server ${index + 1}</option>`
        ).join('');
        
        const episodeInfo = type === 'tv' ? ` S${season}E${episode}` : '';
        
        const isMobile = window.innerWidth <= 768;
        
        videoContainer.innerHTML = `
            <div class="custom-video-player">
                <div style="position: absolute; top: 10px; left: 20px; z-index: 10; color: white; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; ${isMobile ? 'font-size: 12px; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' : ''}">
                    <i class="fas fa-play"></i> Now Playing: ${title}${episodeInfo}
                </div>
                
                <div style="position: absolute; top: 50px; left: 20px; z-index: 10;">
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        <span style="color: white; font-size: ${isMobile ? '10px' : '12px'}; opacity: 0.8;">Select Server:</span>
                        <select id="serverSelector" style="padding: ${isMobile ? '6px 8px' : '8px 15px'}; background: rgba(0,0,0,0.8); color: white; border: 2px solid var(--primary); border-radius: 20px; cursor: pointer; ${isMobile ? 'font-size: 11px; width: 100px;' : 'font-size: 14px; width: 130px;'}">
                            ${sourcesHtml}
                        </select>
                    </div>
                </div>
                
                <iframe 
                    id="videoIframe"
                    src="${sources[0]}" 
                    frameborder="0" 
                    allowfullscreen 
                    allow="autoplay; encrypted-media; picture-in-picture"
                    style="width: 100%; height: ${isMobile ? '50vh' : '80vh'}; border: none;"
                    ${isMobile ? 'webkit-playsinline="true" playsinline' : ''}
                ></iframe>
            </div>
        `;
        
        const serverSelector = document.getElementById('serverSelector');
        const videoIframe = document.getElementById('videoIframe');
        
        if (serverSelector && videoIframe) {
            serverSelector.addEventListener('change', (e) => {
                videoIframe.src = e.target.value;
                showNotification(`Switching to Server ${serverSelector.selectedIndex + 1}...`, 'info');
            });

            serverSelector.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            });
        }
        
        setupIframeErrorHandling(videoIframe, sources, videoContainer);
        
        const modal = document.getElementById('videoPlayerModal');
        if (modal) {
            modal.classList.add('show');
            if (isMobile) {
                document.body.style.overflow = 'hidden';
            }
        }
        
        addToWatchHistory(contentId, type);
        
    } catch (error) {
        console.error('Error playing content:', error);
        showNotification('Error playing video. Trying alternative source...', 'error');
        
        tryAlternativeSource(contentId, type, season, episode);
    }
}

// Close video player
function closeVideoPlayer() {
    const modal = document.getElementById('videoPlayerModal');
    if (modal) {
        modal.classList.remove('show');
    }
    
    const videoIframe = document.getElementById('videoIframe');
    if (videoIframe) {
        videoIframe.src = 'about:blank';
    }
    
    const altVideoIframe = document.getElementById('altVideoIframe');
    if (altVideoIframe) {
        altVideoIframe.src = 'about:blank';
    }
    
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    
    if (serverCheckInterval) {
        clearInterval(serverCheckInterval);
        serverCheckInterval = null;
    }
    
    if (welcomeMessageTimeout) {
        clearTimeout(welcomeMessageTimeout);
    }
    
    document.body.style.overflow = '';
}

// Try alternative source
async function tryAlternativeSource(contentId, type = 'movie', season = 1, episode = 1) {
    const videoContainer = document.getElementById('videoContainer');
    if (!videoContainer) return;
    
    const isMobile = window.innerWidth <= 768;
    
    let sources = [];
    if (type === 'movie') {
        sources = getRealMovieSource(contentId, '', '');
    } else {
        sources = getRealTVSource(contentId, season, episode);
    }
    
    currentSources = sources;
    
    const sourcesHtml = sources.map((src, index) => 
        `<option value="${src}" style="background: var(--secondary); color: white;">Server ${index + 1}</option>`
    ).join('');
    
    const episodeInfo = type === 'tv' ? ` S${season}E${episode}` : '';
    const title = "Alternative Source";
    
    videoContainer.innerHTML = `
        <div class="custom-video-player">
            <div style="position: absolute; top: 10px; left: 20px; z-index: 10; color: white; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; ${isMobile ? 'font-size: 12px; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' : ''}">
                <i class="fas fa-play"></i> ${title}${episodeInfo}
            </div>
            
            <div style="position: absolute; top: 50px; left: 20px; z-index: 10;">
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <span style="color: white; font-size: ${isMobile ? '10px' : '12px'}; opacity: 0.8;">Select Server:</span>
                    <select id="altServerSelector" style="padding: ${isMobile ? '6px 8px' : '8px 15px'}; background: rgba(0,0,0,0.8); color: white; border: 2px solid var(--primary); border-radius: 20px; cursor: pointer; ${isMobile ? 'font-size: 11px; width: 100px;' : 'font-size: 14px; width: 130px;'}">
                        ${sourcesHtml}
                    </select>
                </div>
            </div>
            
            <iframe 
                id="altVideoIframe"
                src="${sources[0]}" 
                frameborder="0" 
                allowfullscreen 
                allow="autoplay; encrypted-media; picture-in-picture"
                style="width: 100%; height: ${isMobile ? '50vh' : '80vh'}; border: none;"
                ${isMobile ? 'webkit-playsinline="true" playsinline' : ''}
            ></iframe>
        </div>
    `;
    
    const altServerSelector = document.getElementById('altServerSelector');
    const altVideoIframe = document.getElementById('altVideoIframe');
    
    if (altServerSelector && altVideoIframe) {
        altServerSelector.addEventListener('change', (e) => {
            altVideoIframe.src = e.target.value;
            showNotification(`Switching to Server ${altServerSelector.selectedIndex + 1}...`, 'info');
        });

        altServerSelector.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        });
    }
    
    setupIframeErrorHandling(altVideoIframe, sources, videoContainer);
}

// Setup video player controls
function setupVideoPlayerControls() {
    const style = document.createElement('style');
    style.textContent = `
        .custom-video-player {
            position: relative;
            width: 100%;
            background: black;
            height: 80vh;
        }
        
        .control-btn.close-btn {
            position: relative;
            z-index: 30;
        }
        
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        
        /* New badge styles */
        .new-badge {
            position: absolute;
            top: 10px;
            left: 10px;
            background: linear-gradient(135deg, #ff4757, #ff6b81);
            color: white;
            padding: 4px 8px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: bold;
            z-index: 10;
            box-shadow: 0 2px 10px rgba(255, 71, 87, 0.3);
            animation: pulse 2s infinite;
            border: 1px solid rgba(255, 255, 255, 0.3);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .new-badge-large {
            display: inline-block;
            background: linear-gradient(135deg, #ff4757, #ff6b81);
            color: white;
            padding: 5px 15px;
            border-radius: 30px;
            font-size: 14px;
            font-weight: bold;
            margin-left: 15px;
            box-shadow: 0 2px 15px rgba(255, 71, 87, 0.4);
            animation: pulse 2s infinite;
            border: 1px solid rgba(255, 255, 255, 0.3);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        /* Improved mobile search styles */
        @media (max-width: 768px) {
            .search-container {
                position: fixed;
                top: 70px;
                left: 10px;
                right: 10px;
                width: auto !important;
                z-index: 9999;
                background: var(--surface);
                border-radius: 30px;
                padding: 5px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                border: 2px solid var(--primary);
                display: none;
            }
            
            .search-container.active {
                display: block;
                animation: slideDown 0.3s ease;
            }
            
            .search-container input {
                width: 100% !important;
                padding: 15px 45px 15px 20px !important;
                font-size: 16px !important;
                background: var(--secondary) !important;
                border: none !important;
                color: white !important;
                border-radius: 25px !important;
            }
            
            .search-container input::placeholder {
                color: rgba(255, 255, 255, 0.6);
                font-size: 16px;
            }
            
            .search-container input:focus {
                outline: none;
                border: 2px solid var(--primary) !important;
            }
            
            .search-icon {
                display: none;
            }
            
            .search-clear {
                right: 20px !important;
                font-size: 18px !important;
                color: white !important;
                background: rgba(255, 71, 87, 0.8) !important;
                width: 30px !important;
                height: 30px !important;
                border-radius: 50% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                top: 12px !important;
            }
            
            .search-results,
            .search-suggestions {
                position: fixed;
                top: 140px;
                left: 10px;
                right: 10px;
                max-height: 60vh !important;
                background: var(--surface);
                border-radius: 15px;
                border: 2px solid var(--primary);
                z-index: 9999 !important;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            }
            
            .search-result-item,
            .suggestion-item {
                padding: 15px !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .search-result-item img,
            .suggestion-item img {
                width: 50px !important;
                height: 75px !important;
            }
            
            .search-result-item div,
            .suggestion-item div {
                font-size: 16px !important;
                color: white !important;
            }
            
            .search-result-item div div,
            .suggestion-item div div {
                font-size: 14px !important;
            }
            
            .mobile-search-trigger {
                display: flex !important;
                background: var(--primary);
                color: white;
                border-radius: 50%;
                width: 45px;
                height: 45px;
                align-items: center;
                justify-content: center;
                box-shadow: 0 5px 15px rgba(0, 168, 255, 0.3);
            }
            
            .custom-video-player {
                height: 50vh;
            }
            
            #serverSelector, #altServerSelector {
                width: 100px !important;
                font-size: 11px !important;
                padding: 6px 8px !important;
            }
            
            .custom-video-player [class*="skip"],
            .custom-video-player [id*="skip"],
            .custom-video-player button[class*="Skip"],
            .custom-video-player button[id*="Skip"],
            iframe [class*="skip"],
            iframe [id*="skip"] {
                z-index: 1001 !important;
                position: relative !important;
                margin-top: 60px !important;
            }
            
            .custom-video-player div[style*="top: 50px; left: 20px;"] {
                top: 50px !important;
                left: 15px !important;
            }
            
            .custom-video-player div[style*="top: 10px; left: 20px;"] {
                font-size: 12px;
                max-width: 150px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                top: 15px !important;
                left: 15px !important;
            }
            
            iframe {
                margin-top: 0;
                height: calc(50vh - 0px) !important;
            }
            
            .modal .modal-content {
                max-height: 90vh;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
            }
            
            body.modal-open {
                overflow: hidden;
                position: fixed;
                width: 100%;
            }
        }
        
        @media (max-width: 480px) {
            #serverSelector, #altServerSelector {
                width: 90px !important;
                font-size: 10px !important;
                padding: 5px 6px !important;
            }
            
            .custom-video-player div[style*="top: 10px; left: 20px;"] {
                max-width: 120px;
                font-size: 11px;
            }
            
            .custom-video-player div[style*="top: 50px; left: 20px;"] span {
                font-size: 9px !important;
            }
            
            .search-container input {
                font-size: 16px !important;
                padding: 12px 40px 12px 15px !important;
            }
            
            .search-results,
            .search-suggestions {
                top: 130px;
            }
            
            .new-badge {
                font-size: 9px;
                padding: 3px 6px;
            }
            
            .new-badge-large {
                font-size: 12px;
                padding: 4px 12px;
                margin-left: 10px;
            }
        }
    `;
    
    document.head.appendChild(style);
}

// Play trailer
function playTrailer(trailerKey) {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    
    const trailerContainer = document.getElementById('trailerContainer');
    if (!trailerContainer) return;
    
    const isMobile = window.innerWidth <= 768;
    
    trailerContainer.innerHTML = '';
    
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&enablejsapi=1${isMobile ? '&playsinline=1' : ''}`;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.style.width = "100%";
    iframe.style.height = isMobile ? "50vh" : "80vh";
    iframe.style.border = "none";
    
    if (isMobile) {
        iframe.setAttribute('webkit-playsinline', 'true');
        iframe.setAttribute('playsinline', 'true');
    }
    
    trailerContainer.appendChild(iframe);
    
    const modal = document.getElementById('trailerModal');
    if (modal) {
        modal.classList.add('show');
        if (isMobile) {
            document.body.style.overflow = 'hidden';
        }
    }
}

// Close trailer
function closeTrailer() {
    const modal = document.getElementById('trailerModal');
    if (modal) {
        modal.classList.remove('show');
    }
    
    const trailerContainer = document.getElementById('trailerContainer');
    if (trailerContainer) {
        trailerContainer.innerHTML = '';
    }
    
    document.body.style.overflow = '';
}

// Setup search autocomplete
function setupSearchAutocomplete() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    searchInput.replaceWith(searchInput.cloneNode(true));
    const newSearchInput = document.getElementById('searchInput');
    
    newSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchSuggestionTimeout);
        
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            hideSearchSuggestions();
            return;
        }
        
        searchSuggestionTimeout = setTimeout(async () => {
            try {
                const [movieRes, tvRes] = await Promise.all([
                    fetch(`${APP_CONFIG.TMDB_BASE_URL}/search/movie?api_key=${APP_CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}`),
                    fetch(`${APP_CONFIG.TMDB_BASE_URL}/search/tv?api_key=${APP_CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}`)
                ]);
                
                const movieData = await movieRes.json();
                const tvData = await tvRes.json();
                
                const allResults = [
                    ...(movieData.results || []).map(m => ({...m, media_type: 'movie'})),
                    ...(tvData.results || []).map(t => ({...t, media_type: 'tv'}))
                ].sort((a, b) => b.popularity - a.popularity).slice(0, 10);
                
                if (allResults.length > 0) {
                    showSearchSuggestions(allResults, query);
                } else {
                    hideSearchSuggestions();
                }
            } catch (error) {
                console.error('Search error:', error);
            }
        }, 300);
    });
    
    newSearchInput.addEventListener('focus', () => {
        const query = newSearchInput.value.trim();
        if (query.length >= 2) {
            const event = new Event('input');
            newSearchInput.dispatchEvent(event);
        }
    });
    
    newSearchInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    newSearchInput.addEventListener('touchstart', (e) => {
        e.stopPropagation();
    });
}

// Show search suggestions
function showSearchSuggestions(items, query) {
    let suggestionsContainer = document.getElementById('searchSuggestions');
    
    if (!suggestionsContainer) {
        suggestionsContainer = document.createElement('div');
        suggestionsContainer.id = 'searchSuggestions';
        suggestionsContainer.className = 'search-suggestions';
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) searchContainer.appendChild(suggestionsContainer);
    }
    
    suggestionsContainer.innerHTML = items.map(item => {
        const title = item.title || item.name || 'Unknown';
        const year = item.release_date ? item.release_date.split('-')[0] : (item.first_air_date ? item.first_air_date.split('-')[0] : 'N/A');
        const type = item.media_type === 'movie' ? '🎬' : '📺';
        const poster = item.poster_path 
            ? `${APP_CONFIG.TMDB_IMAGE_BASE}w92${item.poster_path}`
            : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'46\' height=\'69\' viewBox=\'0 0 46 69\'%3E%3Crect width=\'46\' height=\'69\' fill=\'%23333\'/%3E%3C/svg%3E';
        
        const highlightedTitle = title.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), match => 
            `<span style="color: var(--primary); font-weight: bold;">${match}</span>`
        );
        
        return `
            <div class="suggestion-item" data-id="${item.id}" data-type="${item.media_type}">
                <img src="${poster}" alt="${title}" style="width: 40px; height: 60px; object-fit: cover; border-radius: 3px;" loading="lazy">
                <div style="flex: 1;">
                    <div style="color: var(--text);">${highlightedTitle}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${year} ${type}</div>
                </div>
            </div>
        `;
    }).join('');
    
    suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const id = item.dataset.id;
            const type = item.dataset.type;
            
            if (id && type) {
                hideSearchSuggestions();
                
                const searchContainer = document.querySelector('.search-container');
                if (searchContainer) {
                    searchContainer.classList.remove('active');
                }
                
                showContentDetails(id, type);
            }
        });
        
        item.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const id = item.dataset.id;
            const type = item.dataset.type;
            
            if (id && type) {
                hideSearchSuggestions();
                
                const searchContainer = document.querySelector('.search-container');
                if (searchContainer) {
                    searchContainer.classList.remove('active');
                }
                
                showContentDetails(id, type);
            }
        });
    });
    
    suggestionsContainer.style.display = 'block';
    suggestionsContainer.style.maxHeight = window.innerWidth <= 768 ? '300px' : '400px';
    suggestionsContainer.style.overflowY = 'auto';
    suggestionsContainer.style.zIndex = '9999';
}

// Hide search suggestions
function hideSearchSuggestions() {
    const suggestions = document.getElementById('searchSuggestions');
    if (suggestions) {
        suggestions.style.display = 'none';
    }
}

// Wishlist functions
function toggleWishlist(id, title, poster, type = 'movie') {
    let wishlist = getWishlist();
    const index = wishlist.findIndex(item => item.id == id && item.type === type);
    
    if (index === -1) {
        wishlist.push({ id, title, poster, type, addedAt: Date.now() });
        showNotification(`✓ Added to wishlist (${type === 'movie' ? 'Movie' : 'TV Show'})`, 'success');
    } else {
        wishlist.splice(index, 1);
        showNotification('✗ Removed from wishlist', 'info');
    }
    
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.WISHLIST, JSON.stringify(wishlist));
    updateWishlistCount();
}

function getWishlist() {
    return JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WISHLIST) || '[]');
}

function updateWishlistCount() {
    const wishlist = getWishlist();
    const count = wishlist.length;
    
    const wishlistBtn = document.getElementById('wishlistBtn');
    if (wishlistBtn) {
        let badge = wishlistBtn.querySelector('.wishlist-count');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'wishlist-count';
                wishlistBtn.appendChild(badge);
            }
            badge.textContent = count;
        } else if (badge) {
            badge.remove();
        }
    }
}

function loadWishlist() {
    updateWishlistCount();
}

function showWishlist() {
    const wishlist = getWishlist();
    const grid = document.getElementById('wishlistGrid');
    if (!grid) return;
    
    if (wishlist.length === 0) {
        grid.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">Your wishlist is empty</p>';
    } else {
        grid.innerHTML = wishlist.map(item => {
            const typeIcon = item.type === 'movie' ? '🎬' : '📺';
            return `
                <div class="movie-card" data-id="${item.id}" data-type="${item.type}">
                    <img class="movie-poster" src="${item.poster}" alt="${item.title}" loading="lazy">
                    <div class="movie-info">
                        <div class="movie-title">${item.title} ${typeIcon}</div>
                    </div>
                    <button class="remove-wishlist" data-id="${item.id}" data-type="${item.type}" data-title="${item.title.replace(/'/g, "\\'")}" data-poster="${item.poster}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');
        
        grid.querySelectorAll('.movie-card').forEach(card => {
            let touchMoved = false;
            
            card.addEventListener('touchstart', (e) => {
                touchMoved = false;
                touchStartY = e.touches[0].clientY;
                touchStartX = e.touches[0].clientX;
            }, { passive: true });

            card.addEventListener('touchmove', (e) => {
                if (!touchStartY) return;
                
                const touchY = e.touches[0].clientY;
                const touchX = e.touches[0].clientX;
                const deltaY = Math.abs(touchY - touchStartY);
                const deltaX = Math.abs(touchX - touchStartX);
                
                if (deltaY > 10 || deltaX > 10) {
                    touchMoved = true;
                }
            }, { passive: true });

            card.addEventListener('touchend', (e) => {
                if (!e.target.closest('.remove-wishlist') && !touchMoved && !isScrolling) {
                    e.preventDefault();
                    const id = card.dataset.id;
                    const type = card.dataset.type;
                    showContentDetails(id, type);
                }
            });

            card.addEventListener('click', (e) => {
                if (!e.target.closest('.remove-wishlist') && !isScrolling) {
                    const id = card.dataset.id;
                    const type = card.dataset.type;
                    showContentDetails(id, type);
                }
            });
        });
        
        grid.querySelectorAll('.remove-wishlist').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const type = btn.dataset.type;
                const title = btn.dataset.title;
                const poster = btn.dataset.poster;
                toggleWishlist(id, title, poster, type);
                showWishlist();
            });
            
            btn.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const type = btn.dataset.type;
                const title = btn.dataset.title;
                const poster = btn.dataset.poster;
                toggleWishlist(id, title, poster, type);
                showWishlist();
            });
        });
    }
    
    const modal = document.getElementById('wishlistModal');
    if (modal) modal.classList.add('show');
}

// Continue watching functions
function saveProgress(contentId, timestamp, duration, type = 'movie') {
    if (timestamp < 10 || timestamp > duration - 10) return;
    
    let continueWatching = getContinueWatching();
    const index = continueWatching.findIndex(item => item.id == contentId && item.type === type);
    
    const contentData = {
        id: contentId,
        type,
        timestamp,
        duration,
        lastWatched: Date.now()
    };
    
    if (index === -1) {
        continueWatching.push(contentData);
    } else {
        continueWatching[index] = contentData;
    }
    
    if (continueWatching.length > 15) {
        continueWatching = continueWatching.sort((a, b) => b.lastWatched - a.lastWatched).slice(0, 15);
    }
    
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONTINUE_WATCHING, JSON.stringify(continueWatching));
    loadContinueWatching();
}

function getContinueWatching() {
    return JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CONTINUE_WATCHING) || '[]');
}

function loadContinueWatching() {
    const continueWatching = getContinueWatching();
    const section = document.getElementById('continueWatchingSection');
    const slider = document.getElementById('continueWatchingSlider');
    
    if (!section || !slider) return;
    
    if (continueWatching.length > 0) {
        section.style.display = 'block';
        
        Promise.all(continueWatching.map(async (item) => {
            try {
                const endpoint = item.type === 'movie' ? 'movie' : 'tv';
                const response = await fetch(
                    `${APP_CONFIG.TMDB_BASE_URL}/${endpoint}/${item.id}?api_key=${APP_CONFIG.TMDB_API_KEY}`
                );
                const content = await response.json();
                return { ...content, progress: item, type: item.type };
            } catch (error) {
                return null;
            }
        })).then(contents => {
            const validContents = contents.filter(c => c && c.id);
            if (validContents.length > 0) {
                slider.innerHTML = validContents.map(content => {
                    const title = content.title || content.name;
                    const percent = (content.progress.timestamp / content.progress.duration) * 100;
                    const typeIcon = content.type === 'movie' ? '🎬' : '📺';
                    
                    const poster = content.poster_path 
                        ? `${APP_CONFIG.TMDB_IMAGE_BASE}w342${content.poster_path}`
                        : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'342\' height=\'513\' viewBox=\'0 0 342 513\'%3E%3Crect width=\'342\' height=\'513\' fill=\'%23192a56\'/%3E%3C/svg%3E';
                    
                    return `
                        <div class="movie-card" data-id="${content.id}" data-type="${content.type}">
                            <img class="movie-poster" src="${poster}" alt="${title}" loading="lazy">
                            <div class="movie-info">
                                <div class="movie-title">${title} ${typeIcon}</div>
                                <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.3); margin-top: 5px; border-radius: 2px;">
                                    <div style="width: ${percent}%; height: 100%; background: var(--primary); border-radius: 2px;"></div>
                                </div>
                                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 3px;">
                                    ${Math.floor(content.progress.timestamp / 60)}:${Math.floor(content.progress.timestamp % 60).toString().padStart(2, '0')} / ${Math.floor(content.progress.duration / 60)}:${Math.floor(content.progress.duration % 60).toString().padStart(2, '0')}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
                
                slider.querySelectorAll('.movie-card').forEach(card => {
                    let touchMoved = false;
                    
                    card.addEventListener('touchstart', (e) => {
                        touchMoved = false;
                        touchStartY = e.touches[0].clientY;
                        touchStartX = e.touches[0].clientX;
                    }, { passive: true });

                    card.addEventListener('touchmove', (e) => {
                        if (!touchStartY) return;
                        
                        const touchY = e.touches[0].clientY;
                        const touchX = e.touches[0].clientX;
                        const deltaY = Math.abs(touchY - touchStartY);
                        const deltaX = Math.abs(touchX - touchStartX);
                        
                        if (deltaY > 10 || deltaX > 10) {
                            touchMoved = true;
                        }
                    }, { passive: true });

                    card.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        if (!touchMoved && !isScrolling) {
                            const id = card.dataset.id;
                            const type = card.dataset.type;
                            showContentDetails(id, type);
                        }
                    });

                    card.addEventListener('click', (e) => {
                        if (!isScrolling) {
                            const id = card.dataset.id;
                            const type = card.dataset.type;
                            showContentDetails(id, type);
                        }
                    });
                });
            } else {
                section.style.display = 'none';
            }
        });
    } else {
        section.style.display = 'none';
    }
}

// Watch history
function addToWatchHistory(contentId, type = 'movie') {
    let history = getWatchHistory();
    
    const entry = { id: contentId, type, timestamp: Date.now() };
    
    const existingIndex = history.findIndex(item => item.id == contentId && item.type === type);
    if (existingIndex !== -1) {
        history.splice(existingIndex, 1);
    }
    
    history.unshift(entry);
    
    if (history.length > 50) {
        history = history.slice(0, 50);
    }
    
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.WATCH_HISTORY, JSON.stringify(history));
}

function getWatchHistory() {
    return JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WATCH_HISTORY) || '[]');
}

// Search function
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    
    if (!searchInput || !searchResults) return;
    
    searchInput.replaceWith(searchInput.cloneNode(true));
    const newSearchInput = document.getElementById('searchInput');
    
    newSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            searchResults.classList.remove('show');
            return;
        }
        
        searchTimeout = setTimeout(async () => {
            try {
                const response = await fetch(
                    `${APP_CONFIG.TMDB_BASE_URL}/search/multi?api_key=${APP_CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}`
                );
                const data = await response.json();
                
                if (data.results && data.results.length > 0) {
                    const filteredResults = data.results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');
                    
                    searchResults.innerHTML = filteredResults.slice(0, 8).map(item => {
                        const title = item.title || item.name;
                        const poster = item.poster_path 
                            ? `${APP_CONFIG.TMDB_IMAGE_BASE}w92${item.poster_path}`
                            : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'46\' height=\'69\' viewBox=\'0 0 46 69\'%3E%3Crect width=\'46\' height=\'69\' fill=\'%23333\'/%3E%3C/svg%3E';
                        const year = (item.release_date || item.first_air_date || '').split('-')[0];
                        const typeIcon = item.media_type === 'movie' ? '🎬' : '📺';
                        
                        return `
                            <div class="search-result-item" data-id="${item.id}" data-type="${item.media_type}">
                                <img src="${poster}" alt="${title}" style="width: 46px; height: 69px; object-fit: cover;">
                                <div>
                                    <div style="color: var(--text);">${title}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">${year || ''} ${typeIcon}</div>
                                </div>
                            </div>
                        `;
                    }).join('');
                    
                    searchResults.querySelectorAll('.search-result-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const id = item.dataset.id;
                            const type = item.dataset.type;
                            showContentDetails(id, type);
                            searchResults.classList.remove('show');
                            newSearchInput.value = '';
                            
                            const searchContainer = document.querySelector('.search-container');
                            if (searchContainer) {
                                searchContainer.classList.remove('active');
                            }
                        });
                        
                        item.addEventListener('touchstart', (e) => {
                            e.preventDefault();
                            const id = item.dataset.id;
                            const type = item.dataset.type;
                            showContentDetails(id, type);
                            searchResults.classList.remove('show');
                            newSearchInput.value = '';
                            
                            const searchContainer = document.querySelector('.search-container');
                            if (searchContainer) {
                                searchContainer.classList.remove('active');
                            }
                        });
                    });
                    
                    searchResults.classList.add('show');
                } else {
                    searchResults.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--text-secondary);">No results found</div>';
                    searchResults.classList.add('show');
                }
            } catch (error) {
                console.error('Search error:', error);
                searchResults.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--text-secondary);">Error searching</div>';
                searchResults.classList.add('show');
            }
        }, 500);
    });
    
    document.addEventListener('click', (e) => {
        if (!newSearchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('show');
            hideSearchSuggestions();
        }
    });

    document.addEventListener('touchstart', (e) => {
        if (!newSearchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('show');
            hideSearchSuggestions();
        }
    });
}

// Show notification
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const isMobile = window.innerWidth <= 768;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = message;
    notification.style.cssText = `
        position: fixed;
        top: ${isMobile ? '10px' : '20px'};
        right: ${isMobile ? '10px' : '20px'};
        left: ${isMobile ? '10px' : 'auto'};
        padding: ${isMobile ? '12px 15px' : '15px 25px'};
        background: var(--secondary);
        color: var(--text);
        border-radius: 10px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        z-index: 3000;
        transform: translateX(${isMobile ? '0' : '400px'});
        transition: transform 0.3s ease;
        border-left: 4px solid ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--primary)'};
        text-align: ${isMobile ? 'center' : 'left'};
        font-size: ${isMobile ? '14px' : '16px'};
    `;
    
    document.body.appendChild(notification);
    
    if (!isMobile) {
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);
    }
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Infinite scroll
function setupInfiniteScroll() {
    window.addEventListener('scroll', () => {
        const scrollPosition = window.innerHeight + window.scrollY;
        const threshold = document.body.offsetHeight - 500;
        
        if (scrollPosition >= threshold) {
            if (!isLoading && hasMore) {
                if (currentMediaType === 'movie') {
                    loadAllMovies();
                } else {
                    loadAllTVShows();
                }
            }
        }
    });
}

// Filter by genre
function filterByGenre(genre) {
    currentGenre = genre;
    currentPage = 1;
    currentTvPage = 1;
    hasMore = true;
    
    if (currentMediaType === 'movie') {
        const movieGrid = document.getElementById('movieGrid');
        if (movieGrid) movieGrid.innerHTML = '';
        loadAllMovies(true);
    } else {
        const tvGrid = document.getElementById('tvGrid');
        if (tvGrid) tvGrid.innerHTML = '';
        loadAllTVShows(true);
    }
    
    const section = document.getElementById('allMoviesSection');
    if (section) {
        section.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Setup navigation
function setupNavigation() {
    document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            
            document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(l => {
                l.classList.remove('active');
            });
            
            link.classList.add('active');
            
            if (href === '#home') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (href === '#movies') {
                const section = document.getElementById('allMoviesSection');
                if (section) section.scrollIntoView({ behavior: 'smooth' });
                currentMediaType = 'movie';
                const movieTab = document.getElementById('movieTab');
                const tvTab = document.getElementById('tvTab');
                if (movieTab) movieTab.classList.add('active');
                if (tvTab) tvTab.classList.remove('active');
            } else if (href === '#tvshows') {
                const section = document.getElementById('allMoviesSection');
                if (section) section.scrollIntoView({ behavior: 'smooth' });
                currentMediaType = 'tv';
                const tvTab = document.getElementById('tvTab');
                const movieTab = document.getElementById('movieTab');
                if (tvTab) tvTab.classList.add('active');
                if (movieTab) movieTab.classList.remove('active');
            } else if (href === '#ai-recommendations') {
                const section = document.getElementById('aiRecommendationsSection');
                if (section) section.scrollIntoView({ behavior: 'smooth' });
            } else if (href === '#search') {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.focus();
            } else if (href === '#wishlist') {
                showWishlist();
            }
        });
        
        link.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            
            document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(l => {
                l.classList.remove('active');
            });
            
            link.classList.add('active');
            
            if (href === '#home') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (href === '#movies') {
                const section = document.getElementById('allMoviesSection');
                if (section) section.scrollIntoView({ behavior: 'smooth' });
                currentMediaType = 'movie';
                const movieTab = document.getElementById('movieTab');
                const tvTab = document.getElementById('tvTab');
                if (movieTab) movieTab.classList.add('active');
                if (tvTab) tvTab.classList.remove('active');
            } else if (href === '#tvshows') {
                const section = document.getElementById('allMoviesSection');
                if (section) section.scrollIntoView({ behavior: 'smooth' });
                currentMediaType = 'tv';
                const tvTab = document.getElementById('tvTab');
                const movieTab = document.getElementById('movieTab');
                if (tvTab) tvTab.classList.add('active');
                if (movieTab) movieTab.classList.remove('active');
            } else if (href === '#ai-recommendations') {
                const section = document.getElementById('aiRecommendationsSection');
                if (section) section.scrollIntoView({ behavior: 'smooth' });
            } else if (href === '#search') {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.focus();
            } else if (href === '#wishlist') {
                showWishlist();
            }
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    const closeModal = document.getElementById('closeModal');
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            const modal = document.getElementById('movieModal');
            if (modal) modal.classList.remove('show');
        });
        
        closeModal.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const modal = document.getElementById('movieModal');
            if (modal) modal.classList.remove('show');
        });
    }
    
    const closeTrailerModal = document.getElementById('closeTrailerModal');
    if (closeTrailerModal) {
        closeTrailerModal.addEventListener('click', () => {
            closeTrailer();
        });
        
        closeTrailerModal.addEventListener('touchstart', (e) => {
            e.preventDefault();
            closeTrailer();
        });
    }
    
    const closeVideoModal = document.getElementById('closeVideoModal');
    if (closeVideoModal) {
        closeVideoModal.addEventListener('click', () => {
            closeVideoPlayer();
        });
        
        closeVideoModal.addEventListener('touchstart', (e) => {
            e.preventDefault();
            closeVideoPlayer();
        });
    }
    
    const closeWishlistModal = document.getElementById('closeWishlistModal');
    if (closeWishlistModal) {
        closeWishlistModal.addEventListener('click', () => {
            const modal = document.getElementById('wishlistModal');
            if (modal) modal.classList.remove('show');
        });
        
        closeWishlistModal.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const modal = document.getElementById('wishlistModal');
            if (modal) modal.classList.remove('show');
        });
    }
    
    const wishlistBtn = document.getElementById('wishlistBtn');
    if (wishlistBtn) {
        wishlistBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showWishlist();
        });
        
        wishlistBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            showWishlist();
        });
    }
    
    const watchNowHero = document.getElementById('watchNowHero');
    if (watchNowHero) {
        watchNowHero.addEventListener('click', () => {
            const heroData = document.getElementById('heroBanner').dataset;
            if (heroData.contentId && heroData.contentType) {
                playContent(heroData.contentId, heroData.contentType);
            }
        });
        
        watchNowHero.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const heroData = document.getElementById('heroBanner').dataset;
            if (heroData.contentId && heroData.contentType) {
                playContent(heroData.contentId, heroData.contentType);
            }
        });
    }
    
    const watchTrailerHero = document.getElementById('watchTrailerHero');
    if (watchTrailerHero) {
        watchTrailerHero.addEventListener('click', async () => {
            const heroData = document.getElementById('heroBanner').dataset;
            if (heroData.contentData) {
                const content = JSON.parse(heroData.contentData);
                try {
                    const endpoint = heroData.contentType === 'movie' ? 'movie' : 'tv';
                    const response = await fetch(
                        `${APP_CONFIG.TMDB_BASE_URL}/${endpoint}/${content.id}/videos?api_key=${APP_CONFIG.TMDB_API_KEY}`
                    );
                    const data = await response.json();
                    const trailer = data.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
                    if (trailer) {
                        playTrailer(trailer.key);
                    } else {
                        showNotification('No trailer available', 'info');
                    }
                } catch (error) {
                    console.error('Error loading trailer:', error);
                    showNotification('Error loading trailer', 'error');
                }
            }
        });
        
        watchTrailerHero.addEventListener('touchstart', async (e) => {
            e.preventDefault();
            const heroData = document.getElementById('heroBanner').dataset;
            if (heroData.contentData) {
                const content = JSON.parse(heroData.contentData);
                try {
                    const endpoint = heroData.contentType === 'movie' ? 'movie' : 'tv';
                    const response = await fetch(
                        `${APP_CONFIG.TMDB_BASE_URL}/${endpoint}/${content.id}/videos?api_key=${APP_CONFIG.TMDB_API_KEY}`
                    );
                    const data = await response.json();
                    const trailer = data.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
                    if (trailer) {
                        playTrailer(trailer.key);
                    } else {
                        showNotification('No trailer available', 'info');
                    }
                } catch (error) {
                    console.error('Error loading trailer:', error);
                    showNotification('Error loading trailer', 'error');
                }
            }
        });
    }
    
    const wishlistHero = document.getElementById('wishlistHero');
    if (wishlistHero) {
        wishlistHero.addEventListener('click', () => {
            const heroData = document.getElementById('heroBanner').dataset;
            if (heroData.contentData) {
                const content = JSON.parse(heroData.contentData);
                const title = content.title || content.name;
                const posterUrl = content.poster_path 
                    ? `${APP_CONFIG.TMDB_IMAGE_BASE}w342${content.poster_path}`
                    : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'342\' height=\'513\' viewBox=\'0 0 342 513\'%3E%3Crect width=\'342\' height=\'513\' fill=\'%23192a56\'/%3E%3C/svg%3E';
                toggleWishlist(content.id, title, posterUrl, heroData.contentType || 'movie');
            }
        });
        
        wishlistHero.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const heroData = document.getElementById('heroBanner').dataset;
            if (heroData.contentData) {
                const content = JSON.parse(heroData.contentData);
                const title = content.title || content.name;
                const posterUrl = content.poster_path 
                    ? `${APP_CONFIG.TMDB_IMAGE_BASE}w342${content.poster_path}`
                    : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'342\' height=\'513\' viewBox=\'0 0 342 513\'%3E%3Crect width=\'342\' height=\'513\' fill=\'%23192a56\'/%3E%3C/svg%3E';
                toggleWishlist(content.id, title, posterUrl, heroData.contentType || 'movie');
            }
        });
    }
    
    document.querySelectorAll('.genre-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.genre-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            filterByGenre(item.dataset.genre);
        });
        
        item.addEventListener('touchstart', (e) => {
            e.preventDefault();
            document.querySelectorAll('.genre-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            filterByGenre(item.dataset.genre);
        });
    });
    
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        const header = document.querySelector('.header');
        
        if (header) {
            if (currentScroll > lastScroll && currentScroll > 100) {
                header.classList.add('hide');
            } else {
                header.classList.remove('hide');
            }
        }
        
        lastScroll = currentScroll;
    });
    
    setupSearch();
    
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
            if (e.target.id === 'trailerModal') {
                closeTrailer();
            }
            if (e.target.id === 'videoPlayerModal') {
                closeVideoPlayer();
            }
        }
    });
    
    window.addEventListener('touchstart', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
            if (e.target.id === 'trailerModal') {
                closeTrailer();
            }
            if (e.target.id === 'videoPlayerModal') {
                closeVideoPlayer();
            }
        }
    });
}

// Add additional styles
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: var(--secondary);
        color: var(--text);
        border-radius: 10px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        z-index: 3000;
        transform: translateX(400px);
        transition: transform 0.3s ease;
        border-left: 4px solid var(--primary);
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification.success {
        border-left-color: var(--success);
    }
    
    .notification.error {
        border-left-color: var(--error);
    }
    
    .notification.info {
        border-left-color: var(--primary);
    }
    
    .search-result-item {
        display: flex;
        gap: 10px;
        padding: 10px;
        cursor: pointer;
        transition: background 0.3s ease;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        background: var(--secondary);
        color: var(--text);
    }
    
    .search-result-item:hover {
        background: var(--surface);
    }
    
    .search-result-item:last-child {
        border-bottom: none;
    }
    
    .search-suggestions {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--secondary);
        border-radius: 5px;
        margin-top: 5px;
        max-height: 400px;
        overflow-y: auto;
        z-index: 2000;
        display: none;
        box-shadow: 0 5px 20px rgba(0,0,0,0.3);
    }
    
    .suggestion-item {
        display: flex;
        gap: 10px;
        padding: 12px 15px;
        cursor: pointer;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        transition: background 0.3s ease;
        align-items: center;
        background: var(--secondary);
        color: var(--text);
    }
    
    .suggestion-item:hover {
        background: var(--surface);
    }
    
    .suggestion-item:last-child {
        border-bottom: none;
    }
    
    .wishlist-count {
        position: absolute;
        top: -5px;
        right: -5px;
        background: var(--primary);
        color: white;
        border-radius: 50%;
        width: 18px;
        height: 18px;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .remove-wishlist {
        position: absolute;
        top: 5px;
        right: 5px;
        background: rgba(255, 71, 87, 0.8);
        border: none;
        color: white;
        width: 25px;
        height: 25px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: 10;
    }
    
    .movie-card:hover .remove-wishlist {
        opacity: 1;
    }
    
    .remove-wishlist:hover {
        background: var(--error);
    }
    
    .media-tabs {
        display: flex;
        gap: 20px;
        margin: 20px 0;
        justify-content: center;
    }
    
    .media-tab {
        padding: 12px 30px;
        background: var(--surface);
        border: 2px solid var(--primary);
        border-radius: 30px;
        color: var(--text);
        cursor: pointer;
        font-weight: bold;
        transition: all 0.3s ease;
    }
    
    .media-tab:hover,
    .media-tab.active {
        background: var(--primary);
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(0, 168, 255, 0.3);
    }
    
    select {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
        background-repeat: no-repeat;
        background-position: right 10px center;
        background-size: 16px;
        padding-right: 30px !important;
    }
    
    select option {
        background: var(--secondary);
        color: white;
        padding: 10px;
    }
    
    select:focus {
        outline: none;
        border-color: var(--accent);
    }
`;

document.head.appendChild(style);

// Make functions globally available
window.showContentDetails = showContentDetails;
window.playContent = playContent;
window.playTrailer = playTrailer;
window.toggleWishlist = toggleWishlist;
window.showWishlist = showWishlist;
window.closeVideoPlayer = closeVideoPlayer;
window.closeTrailer = closeTrailer;