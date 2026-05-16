document.addEventListener('DOMContentLoaded', () => {
    // --- SUPABASE CONFIGURATION ---
    // User needs to fill these from Supabase Project Settings
    const SUPABASE_URL = 'https://cvsdvxygucjbbtyydgmx.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_C32o3FATbcSmVNhxZyCRgA_0pjUX_Lr'; // User: Fill this in!
    const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

    // --- UI ELEMENTS ---
    const authModal = document.getElementById('auth-modal');
    const authBtn = document.getElementById('auth-btn');
    const closeModal = document.querySelector('.close-modal');
    const authForm = document.getElementById('auth-form');
    const toggleAuth = document.getElementById('toggle-auth');
    const dashboard = document.getElementById('dashboard');
    const landingContent = document.getElementById('landing-content');
    const logoutBtn = document.getElementById('logout-btn');
    const heroSignup = document.getElementById('hero-signup');
    const cursorGlow = document.getElementById('cursor-glow');

    let isLogin = true;

    // --- AUTH LOGIC ---
    const updateUI = async (user) => {
        if (user) {
            authBtn.textContent = 'Dashboard';
            landingContent.style.display = 'none';
            dashboard.style.display = 'block';
            
            // Proactive Profile Fetching
            try {
                let { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .single();
                
                // If profile doesn't exist (can happen right after signup if trigger delay)
                if (!data && user) {
                    console.log('Profile not found, attempting to create...');
                    const newKey = 'pk_' + Math.random().toString(36).substring(2, 15);
                    const { data: newData, error: createError } = await supabase
                        .from('profiles')
                        .insert([{ id: user.id, api_key: newKey, tier: 'Starter' }])
                        .select()
                        .single();
                    data = newData;
                }

                if (data) {
                    document.getElementById('display-api-key').textContent = data.api_key;
                    document.getElementById('user-tier').textContent = data.tier;
                }
            } catch (err) {
                console.error('Profile Load Error:', err);
            }
        } else {
            authBtn.textContent = 'Login';
            landingContent.style.display = 'block';
            dashboard.style.display = 'none';
        }
    };

    let currentUser = null;

    // --- AUTH NAVIGATION ---
    const navToAuth = () => {
        window.location.href = 'auth.html';
    };

    if (authBtn) {
        authBtn.addEventListener('click', () => {
            if (currentUser) {
                const dashboardEl = document.getElementById('dashboard');
                if (dashboardEl) dashboardEl.scrollIntoView({ behavior: 'smooth' });
            } else {
                navToAuth();
            }
        });
    }

    if (heroSignup) heroSignup.addEventListener('click', navToAuth);

    // --- AUTH FORM LOGIC (On auth.html) ---
    if (authForm && window.location.pathname.includes('auth.html')) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const submitBtn = document.getElementById('auth-submit');
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Initializing...';

            try {
                if (isLogin) {
                    const { error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                    window.location.href = 'index.html';
                } else {
                    const { error } = await supabase.auth.signUp({ 
                        email, 
                        password,
                        options: { emailRedirectTo: window.location.origin }
                    });
                    if (error) throw error;
                    alert('Node Registered! Please check your email for activation.');
                }
            } catch (err) {
                alert('Verification Failed: ' + err.message);
                submitBtn.disabled = false;
                submitBtn.textContent = isLogin ? 'Initialize Session' : 'Register Node';
            }
        });

        const toggleAuthBtn = document.getElementById('toggle-auth');
        if (toggleAuthBtn) {
            toggleAuthBtn.addEventListener('click', () => {
                isLogin = !isLogin;
                document.getElementById('auth-title').textContent = isLogin ? 'Identity Verification' : 'New Node Registration';
                document.getElementById('auth-subtitle').textContent = isLogin ? 'Enter your encrypted credentials.' : 'Create your developer credentials.';
                document.getElementById('toggle-text').textContent = isLogin ? 'Need to register a new node?' : 'Already have a session?';
                toggleAuthBtn.textContent = isLogin ? 'Create Account' : 'Login';
                document.getElementById('auth-submit').textContent = isLogin ? 'Initialize Session' : 'Register Node';
            });
        }
    }

    if (supabase) {
        supabase.auth.getSession().then(({ data: { session } }) => {
            currentUser = session?.user;
            updateUI(currentUser);
        });

        supabase.auth.onAuthStateChange((event, session) => {
            currentUser = session?.user;
            updateUI(currentUser);
        });

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await supabase.auth.signOut();
                window.location.href = 'index.html';
            });
        }
    }

    // --- INTEGRATION TABS ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === tabId) {
                    content.classList.add('active');
                }
            });
        });
    });

    // Copy Key Handler
    const copyBtn = document.getElementById('copy-key');
    if (copyBtn) copyBtn.addEventListener('click', () => {
        const key = document.getElementById('display-api-key').textContent;
        navigator.clipboard.writeText(key).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = originalText, 2000);
        });
    });

    // --- ANIMATIONS & GLOW ---
    if (cursorGlow && !window.matchMedia('(max-width: 768px)').matches) {
        document.addEventListener('mousemove', (e) => {
            requestAnimationFrame(() => {
                cursorGlow.style.left = `${e.clientX}px`;
                cursorGlow.style.top = `${e.clientY}px`;
                cursorGlow.style.transform = `translate(-50%, -50%)`;
            });
        });
    }
});
