/* =====================================================================
   AI Specialty Recommender (front page)
   ---------------------------------------------------------------------
   A lightweight, on-device symptom → specialty matcher used as a stand-in
   until a real AI endpoint is wired up. To swap in a real model later,
   replace analyzeSymptoms() with a call that returns { key, reason }.
   ===================================================================== */

(function () {
    const modal = document.getElementById('aiModal');
    if (!modal) return;

    const openBtn = document.getElementById('askAiOpen');
    const analyzeBtn = document.getElementById('aiAnalyze');
    const symptoms = document.getElementById('aiSymptoms');
    const result = document.getElementById('aiResult');
    const select = document.getElementById('speciality');

    // Keyword bank per specialty (keys match the <option data-key="...">).
    const KEYWORDS = {
        cardiology: ['heart', 'chest pain', 'palpitation', 'palpitations', 'blood pressure',
            'hypertension', 'cholesterol', 'heartbeat', 'cardiac'],
        dermatology: ['skin', 'rash', 'acne', 'pimple', 'pimples', 'itching', 'itchy', 'hair fall',
            'hair loss', 'dandruff', 'eczema', 'psoriasis', 'mole', 'allergy on skin'],
        dentistry: ['tooth', 'teeth', 'gum', 'gums', 'dental', 'toothache', 'cavity', 'cavities',
            'wisdom tooth', 'jaw pain'],
        ent: ['ear', 'ears', 'nose', 'throat', 'hearing', 'sinus', 'sinuses', 'tonsil', 'tonsils',
            'sore throat', 'runny nose', 'nasal', 'vertigo', 'earache', 'blocked nose'],
        gastroenterology: ['stomach', 'abdominal', 'abdomen', 'digestion', 'indigestion', 'acidity',
            'acid reflux', 'nausea', 'vomiting', 'diarrhea', 'constipation', 'gas', 'bloating', 'liver',
            'ulcer'],
        gynecology: ['pregnant', 'pregnancy', 'menstrual', 'menstruation', 'periods', 'period pain',
            'vaginal', 'ovary', 'uterus', 'pcos', 'menopause'],
        neurology: ['headache', 'migraine', 'seizure', 'seizures', 'dizziness', 'dizzy', 'numbness',
            'tingling', 'tremor', 'memory loss', 'fits', 'nerve'],
        ophthalmology: ['eye', 'eyes', 'vision', 'visual', 'blur', 'blurry', 'blurred', 'blurriness',
            'sight', 'retina', 'glaucoma', 'cataract', 'watery', 'red eye', 'double vision'],
        orthopedics: ['bone', 'bones', 'joint', 'joints', 'fracture', 'fractured', 'knee', 'back pain',
            'shoulder', 'muscle', 'muscles', 'sprain', 'sprained', 'hip', 'arthritis', 'ligament',
            'spine', 'wrist', 'ankle', 'swollen joint'],
        pediatrics: ['child', 'children', 'kid', 'kids', 'infant', 'infants', 'baby', 'babies',
            'toddler', 'newborn', 'my son', 'my daughter'],
        psychiatry: ['anxiety', 'anxious', 'depression', 'depressed', 'stress', 'stressed', 'mental',
            'panic', 'insomnia', 'sleepless', 'mood', 'sad all the time'],
        pulmonology: ['breath', 'breathing', 'breathless', 'shortness of breath', 'cough', 'coughing',
            'lung', 'lungs', 'respiratory', 'asthma', 'wheeze', 'wheezing', 'phlegm', 'pneumonia',
            'chest congestion'],
        general_physician: ['fever', 'cold', 'flu', 'weakness', 'fatigue', 'body ache', 'tired',
            'general checkup', 'not feeling well', 'headache and fever']
    };

    const REASONS = {
        cardiology: 'Your symptoms relate to the heart or blood pressure.',
        dermatology: 'Your symptoms relate to the skin or hair.',
        dentistry: 'Your symptoms relate to teeth or gums.',
        ent: 'Your symptoms involve the ear, nose or throat.',
        gastroenterology: 'Your symptoms relate to digestion or the stomach.',
        gynecology: 'Your description relates to women\'s health.',
        neurology: 'Your symptoms relate to the brain or nerves.',
        ophthalmology: 'Your symptoms point to the eyes / vision.',
        orthopedics: 'Your symptoms relate to bones, joints or muscles.',
        pediatrics: 'Your description is about a child or infant.',
        psychiatry: 'Your description relates to mental or emotional health.',
        pulmonology: 'Your symptoms relate to breathing or the lungs.',
        general_physician: 'These look like general symptoms a physician can assess first.'
    };

    function analyzeSymptoms(text) {
        const t = (text || '').toLowerCase();
        let best = null;
        let bestScore = 0;
        for (const key in KEYWORDS) {
            let score = 0;
            for (const word of KEYWORDS[key]) {
                if (t.includes(word)) score += 1;
            }
            if (score > bestScore) {
                bestScore = score;
                best = key;
            }
        }
        return bestScore > 0 ? { key: best, reason: REASONS[best] } : null;
    }

    function optionForKey(key) {
        return select ? select.querySelector('option[data-key="' + key + '"]') : null;
    }

    // Clear the textarea and any previous suggestion so the modal opens fresh.
    function resetModal() {
        if (symptoms) symptoms.value = '';
        if (result) {
            result.hidden = true;
            result.innerHTML = '';
        }
    }

    // ---- Modal open / close ----
    function openModal() {
        resetModal();
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        setTimeout(() => symptoms && symptoms.focus(), 50);
    }

    function closeModal() {
        modal.hidden = true;
        document.body.style.overflow = '';
    }

    if (openBtn) openBtn.addEventListener('click', openModal);

    modal.querySelectorAll('[data-ai-close]').forEach(el => el.addEventListener('click', closeModal));

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !modal.hidden) closeModal();
    });

    // ---- Analyze ----
    function renderResult(match) {
        if (!match) {
            result.hidden = false;
            result.innerHTML =
                '<div class="ai-result-spec"><span class="material-symbols-outlined">help</span> No clear match</div>' +
                '<p>We couldn\'t confidently match your symptoms. Please choose the closest specialty, ' +
                'or consult a General Physician who can refer you.</p>';
            return;
        }
        const option = optionForKey(match.key);
        const label = option ? option.textContent.trim() : match.key;
        result.hidden = false;
        result.innerHTML =
            '<div class="ai-result-spec"><span class="material-symbols-outlined">check_circle</span> ' + label + '</div>' +
            '<p>' + match.reason + ' We recommend booking with <strong>' + label + '</strong>.</p>' +
            '<button type="button" class="ai-use" id="aiUse"><span class="material-symbols-outlined">arrow_forward</span> Use this specialty</button>';

        const useBtn = document.getElementById('aiUse');
        if (useBtn && option) {
            useBtn.addEventListener('click', () => {
                select.value = option.value;
                closeModal();
                document.getElementById('search')
                    .scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
            const text = symptoms.value.trim();
            if (!text) {
                result.hidden = false;
                result.innerHTML =
                    '<div class="ai-result-spec"><span class="material-symbols-outlined">edit_note</span> Tell us more</div>' +
                    '<p>Please describe your symptoms first.</p>';
                symptoms.focus();
                return;
            }

            const original = analyzeBtn.innerHTML;
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<span class="material-symbols-outlined">progress_activity</span> Analyzing…';

            // Small delay to mimic processing; replace with a real request when ready.
            setTimeout(() => {
                renderResult(analyzeSymptoms(text));
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = original;
            }, 500);
        });
    }
})();
