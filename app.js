document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const vibeForm = document.getElementById('vibe-form');
    const vibeInput = document.getElementById('vibe-input');
    const generateBtn = document.getElementById('generate-btn');
    const btnText = document.querySelector('.btn-text');
    const spinner = document.querySelector('.spinner');
    const paletteDisplay = document.getElementById('palette-display');
    
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const saveBtn = document.getElementById('save-key-btn');
    const apiKeyInput = document.getElementById('api-key-input');
    
    const toast = document.getElementById('toast');

    // State
    const API_KEY_STORAGE = 'vibe_check_gemini_key';
    
    // Check if API key exists
    const storedKey = localStorage.getItem(API_KEY_STORAGE);
    if (storedKey) {
        apiKeyInput.value = storedKey;
    } else {
        // Show modal on first load if no key
        setTimeout(() => openModal(), 500);
    }

    // Modal Logic
    function openModal() {
        settingsModal.classList.remove('hidden');
        // Small delay to allow display to apply before opacity transition
        requestAnimationFrame(() => {
            settingsModal.classList.add('show');
        });
    }

    function closeModal() {
        settingsModal.classList.remove('show');
        setTimeout(() => {
            settingsModal.classList.add('hidden');
        }, 300); // Match transition duration
    }

    settingsBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    
    saveBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem(API_KEY_STORAGE, key);
            showToast('API Key saved!');
            closeModal();
        }
    });

    // Form submission
    vibeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const vibe = vibeInput.value.trim();
        const apiKey = localStorage.getItem(API_KEY_STORAGE);

        if (!vibe) return;

        if (!apiKey) {
            openModal();
            return;
        }

        setLoadingState(true);

        try {
            const colors = await fetchPaletteFromGemini(vibe, apiKey);
            renderPalette(colors);
        } catch (error) {
            console.error(error);
            showToast(error.message || 'Error generating palette. Check console logs.');
        } finally {
            setLoadingState(false);
        }
    });

    function setLoadingState(isLoading) {
        generateBtn.disabled = isLoading;
        if (isLoading) {
            btnText.classList.add('hidden');
            spinner.classList.remove('hidden');
            paletteDisplay.classList.remove('visible');
            setTimeout(() => {
                if(isLoading) paletteDisplay.classList.add('hidden');
            }, 600);
        } else {
            btnText.classList.remove('hidden');
            spinner.classList.add('hidden');
        }
    }

    async function fetchPaletteFromGemini(prompt, apiKey) {
        // Dynamically find an available model that supports generateContent
        let selectedModel = "models/gemini-2.0-flash"; // modern fallback
        try {
            const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (listResponse.ok) {
                const listData = await listResponse.json();
                const validModels = listData.models.filter(m => 
                    m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
                );
                
                // Prefer a 'flash' model if available, otherwise just pick the first valid one
                const flashModel = validModels.find(m => m.name.includes("flash"));
                if (flashModel) {
                    selectedModel = flashModel.name;
                } else if (validModels.length > 0) {
                    selectedModel = validModels[validModels.length - 1].name; // usually newer ones are later
                }
            }
        } catch (e) {
            console.warn("Could not fetch model list, falling back to default:", e);
        }

        const modelPath = selectedModel.startsWith('models/') ? selectedModel : `models/${selectedModel}`;
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${apiKey}`;
        
        // Strict system instruction to only get JSON array back
        const payload = {
            contents: [{
                parts: [{
                    text: `Analyze this mood/scene: "${prompt}". Create a matching 5-color hex palette. Respond ONLY with a valid JSON array of 5 hex color strings. Example: ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#00FFFF"]. Do not use markdown backticks like \`\`\`json.`
                }]
            }],
            generationConfig: {
                temperature: 0.9,
                response_mime_type: "application/json"
            }
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errMsg = `API error: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.error && errorData.error.message) {
                    errMsg = errorData.error.message;
                }
            } catch (e) {}
            throw new Error(errMsg);
        }

        const data = await response.json();
        
        // Extract array from response
        try {
            if (!data.candidates || data.candidates.length === 0) {
                throw new Error("No response from AI. This could be due to safety block.");
            }
            let textResponse = data.candidates[0].content.parts[0].text;
            // Clean up any potential markdown formatting the LLM might stubbornly include
            textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            const colors = JSON.parse(textResponse);
            if (Array.isArray(colors) && colors.length >= 5) {
                return colors.slice(0, 5);
            }
            throw new Error('Invalid format returned by LLM');
        } catch(e) {
            console.error('Parse error:', e, data);
            throw new Error(e.message || 'Failed to parse colors from response');
        }
    }

    function renderPalette(colors) {
        paletteDisplay.innerHTML = '';
        paletteDisplay.classList.remove('hidden');
        
        // Small delay to allow display to apply before transitioning
        requestAnimationFrame(() => {
            paletteDisplay.classList.add('visible');
            
            colors.forEach((color, index) => {
                const card = document.createElement('div');
                card.className = 'color-card';
                card.style.backgroundColor = color;
                // Add a staggered entrance animation if desired
                card.style.animation = `fadeInUp 0.5s ease backwards ${index * 0.1}s`;

                // Calculate contrast to set text color (black/white)
                const textColor = getContrastYIQ(color);

                const info = document.createElement('div');
                info.className = 'color-info';
                info.style.color = textColor;
                info.style.backgroundColor = textColor === '#000000' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
                info.textContent = color;

                card.appendChild(info);
                
                // Click to copy
                card.addEventListener('click', () => {
                    navigator.clipboard.writeText(color).then(() => {
                        showToast(`Copied ${color}!`);
                    });
                });

                paletteDisplay.appendChild(card);
            });
        });
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.remove('hidden');
        // display then transition
        requestAnimationFrame(() => {
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.classList.add('hidden'), 400);
            }, 3000);
        });
    }

    // Helper to determine text color over background
    function getContrastYIQ(hexcolor){
        hexcolor = hexcolor.replace("#", "");
        if (hexcolor.length === 3) {
            hexcolor = hexcolor.split('').map(x => x + x).join('');
        }
        var r = parseInt(hexcolor.substr(0,2),16);
        var g = parseInt(hexcolor.substr(2,2),16);
        var b = parseInt(hexcolor.substr(4,2),16);
        var yiq = ((r*299)+(g*587)+(b*114))/1000;
        return (yiq >= 128) ? '#000000' : '#ffffff';
    }
});

// Add a quick animation style via JS
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);
