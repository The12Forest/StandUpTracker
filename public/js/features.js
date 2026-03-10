// ============================================
// StandUpTracker Features - Gamification & Reminders
// ============================================

const Features = (function() {
    // ============================================
    // ACHIEVEMENTS SYSTEM
    // ============================================
    const ACHIEVEMENTS = [
        { id: 'first_stand', name: 'Erster Schritt', desc: 'Stehe zum ersten Mal', icon: '🚶', check: (stats) => stats.totalDays >= 1 },
        { id: 'streak_3', name: 'Auf dem Weg', desc: '3 Tage Streak', icon: '🔥', check: (stats) => stats.currentStreak >= 3 },
        { id: 'streak_7', name: 'Woche geschafft', desc: '7 Tage Streak', icon: '🏆', check: (stats) => stats.currentStreak >= 7 },
        { id: 'streak_14', name: 'Zwei Wochen stark', desc: '14 Tage Streak', icon: '💪', check: (stats) => stats.currentStreak >= 14 },
        { id: 'streak_30', name: 'Monatsheld', desc: '30 Tage Streak', icon: '👑', check: (stats) => stats.currentStreak >= 30 },
        { id: 'streak_100', name: 'Legende', desc: '100 Tage Streak', icon: '🌟', check: (stats) => stats.currentStreak >= 100 },
        { id: 'hours_1', name: 'Eine Stunde', desc: '1 Stunde total', icon: '⏱️', check: (stats) => stats.totalSeconds >= 3600 },
        { id: 'hours_10', name: '10 Stunden', desc: '10 Stunden total', icon: '⏰', check: (stats) => stats.totalSeconds >= 36000 },
        { id: 'hours_50', name: '50 Stunden', desc: '50 Stunden total', icon: '🕐', check: (stats) => stats.totalSeconds >= 180000 },
        { id: 'hours_100', name: 'Century Club', desc: '100 Stunden total', icon: '💯', check: (stats) => stats.totalSeconds >= 360000 },
        { id: 'hours_500', name: 'Marathonläufer', desc: '500 Stunden total', icon: '🏅', check: (stats) => stats.totalSeconds >= 1800000 },
        { id: 'goal_hit_5', name: 'Zielstrebig', desc: '5x Tagesziel erreicht', icon: '🎯', check: (stats) => stats.goalHitDays >= 5 },
        { id: 'goal_hit_20', name: 'Konstant', desc: '20x Tagesziel erreicht', icon: '📈', check: (stats) => stats.goalHitDays >= 20 },
        { id: 'goal_hit_50', name: 'Profi', desc: '50x Tagesziel erreicht', icon: '🥇', check: (stats) => stats.goalHitDays >= 50 },
        { id: 'early_bird', name: 'Frühaufsteher', desc: 'Vor 8 Uhr gestartet', icon: '🌅', check: (stats) => stats.earlyStart },
        { id: 'night_owl', name: 'Nachteule', desc: 'Nach 20 Uhr gestanden', icon: '🦉', check: (stats) => stats.lateStand },
        { id: 'double_goal', name: 'Überflieger', desc: '2x Tagesziel an einem Tag', icon: '🚀', check: (stats) => stats.doubleGoalDay },
    ];

    // ============================================
    // LEVEL SYSTEM
    // ============================================
    const LEVELS = [
        { level: 1, name: 'Anfänger', minHours: 0, icon: '🌱' },
        { level: 2, name: 'Einsteiger', minHours: 5, icon: '🌿' },
        { level: 3, name: 'Fortgeschritten', minHours: 15, icon: '🌳' },
        { level: 4, name: 'Erfahren', minHours: 30, icon: '⭐' },
        { level: 5, name: 'Experte', minHours: 60, icon: '🌟' },
        { level: 6, name: 'Meister', minHours: 100, icon: '💫' },
        { level: 7, name: 'Großmeister', minHours: 200, icon: '👑' },
        { level: 8, name: 'Legende', minHours: 500, icon: '🏆' },
        { level: 9, name: 'Mythos', minHours: 1000, icon: '🔱' },
        { level: 10, name: 'Unsterblich', minHours: 2000, icon: '✨' },
    ];

    // ============================================
    // DAILY CHALLENGES
    // ============================================
    const DAILY_CHALLENGES = [
        { id: 'stand_30', desc: '30 Minuten stehen', target: 1800, icon: '🎯' },
        { id: 'stand_60', desc: '60 Minuten stehen', target: 3600, icon: '🎯' },
        { id: 'stand_90', desc: '90 Minuten stehen', target: 5400, icon: '💪' },
        { id: 'stand_120', desc: '2 Stunden stehen', target: 7200, icon: '🔥' },
        { id: 'beat_goal', desc: 'Tagesziel übertreffen', type: 'goal_beat', icon: '🚀' },
        { id: 'early_start', desc: 'Vor 9 Uhr starten', type: 'early', icon: '🌅' },
    ];

    const WEEKLY_CHALLENGES = [
        { id: 'week_5h', desc: '5 Stunden diese Woche', target: 18000, icon: '📅' },
        { id: 'week_10h', desc: '10 Stunden diese Woche', target: 36000, icon: '📊' },
        { id: 'week_streak', desc: '5 Tage in Folge diese Woche', type: 'streak', target: 5, icon: '🔥' },
        { id: 'week_goals', desc: '5x Tagesziel diese Woche', type: 'goals', target: 5, icon: '🎯' },
    ];

    // ============================================
    // STATE
    // ============================================
    let featuresData = {
        unlockedAchievements: [],
        challengeHistory: [],
        currentDailyChallenge: null,
        currentWeeklyChallenge: null,
        dailyChallengeDate: null,
        weeklyChallengeWeek: null,
        lastCelebration: null,
        // Reminders
        sitReminderEnabled: false,
        sitReminderMinutes: 45,
        standBreakEnabled: false,
        standBreakMinutes: 60,
        notificationSound: true,
        lastSitReminder: null,
        lastStandBreakReminder: null,
    };

    let reminderIntervalId = null;

    // ============================================
    // STORAGE
    // ============================================
    function loadFeaturesData() {
        const stored = localStorage.getItem('standuptracker_features');
        if (stored) {
            featuresData = { ...featuresData, ...JSON.parse(stored) };
        }
        initChallenges();
    }

    function saveFeaturesData() {
        localStorage.setItem('standuptracker_features', JSON.stringify(featuresData));
    }

    // ============================================
    // STATS CALCULATION
    // ============================================
    function calculateStats(data, goal) {
        const keys = Object.keys(data).sort();
        let totalSeconds = 0;
        let totalDays = 0;
        let goalHitDays = 0;
        let currentStreak = 0;
        let bestStreak = 0;
        let runStreak = 0;
        let doubleGoalDay = false;
        let earlyStart = false;
        let lateStand = false;

        const goalSeconds = goal * 60;

        keys.forEach(k => {
            const sec = data[k] || 0;
            if (sec > 180) { // More than 3 minutes = counted day
                totalSeconds += sec;
                totalDays++;
                if (sec >= goalSeconds) {
                    goalHitDays++;
                    runStreak++;
                    bestStreak = Math.max(bestStreak, runStreak);
                } else {
                    runStreak = 0;
                }
                if (sec >= goalSeconds * 2) {
                    doubleGoalDay = true;
                }
            } else {
                runStreak = 0;
            }
        });

        // Calculate current streak from end
        currentStreak = 0;
        for (let i = keys.length - 1; i >= 0; i--) {
            if ((data[keys[i]] || 0) >= goalSeconds) {
                currentStreak++;
            } else {
                break;
            }
        }

        // Check time-based achievements
        const hour = new Date().getHours();
        if (hour < 8) earlyStart = true;
        if (hour >= 20) lateStand = true;

        return {
            totalSeconds,
            totalDays,
            goalHitDays,
            currentStreak,
            bestStreak,
            doubleGoalDay,
            earlyStart,
            lateStand,
        };
    }

    // ============================================
    // LEVEL SYSTEM
    // ============================================
    function getLevel(totalSeconds) {
        const hours = totalSeconds / 3600;
        let currentLevel = LEVELS[0];
        for (const level of LEVELS) {
            if (hours >= level.minHours) {
                currentLevel = level;
            }
        }
        return currentLevel;
    }

    function getLevelProgress(totalSeconds) {
        const hours = totalSeconds / 3600;
        const currentLevel = getLevel(totalSeconds);
        const currentIndex = LEVELS.indexOf(currentLevel);
        
        if (currentIndex >= LEVELS.length - 1) {
            return { current: currentLevel, next: null, progress: 100 };
        }
        
        const nextLevel = LEVELS[currentIndex + 1];
        const progressHours = hours - currentLevel.minHours;
        const neededHours = nextLevel.minHours - currentLevel.minHours;
        const progress = Math.min(100, (progressHours / neededHours) * 100);
        
        return { current: currentLevel, next: nextLevel, progress };
    }

    // ============================================
    // ACHIEVEMENTS
    // ============================================
    function checkAchievements(data, goal) {
        const stats = calculateStats(data, goal);
        const newUnlocks = [];

        ACHIEVEMENTS.forEach(achievement => {
            if (!featuresData.unlockedAchievements.includes(achievement.id)) {
                if (achievement.check(stats)) {
                    featuresData.unlockedAchievements.push(achievement.id);
                    newUnlocks.push(achievement);
                }
            }
        });

        if (newUnlocks.length > 0) {
            saveFeaturesData();
            newUnlocks.forEach(a => showAchievementUnlock(a));
        }

        return newUnlocks;
    }

    function getUnlockedAchievements() {
        return ACHIEVEMENTS.filter(a => featuresData.unlockedAchievements.includes(a.id));
    }

    function getAllAchievements() {
        return ACHIEVEMENTS.map(a => ({
            ...a,
            unlocked: featuresData.unlockedAchievements.includes(a.id)
        }));
    }

    // ============================================
    // CHALLENGES
    // ============================================
    function initChallenges() {
        const today = new Date().toISOString().split('T')[0];
        const weekNum = getWeekNumber(new Date());

        // Daily challenge
        if (featuresData.dailyChallengeDate !== today) {
            const randomDaily = DAILY_CHALLENGES[Math.floor(Math.random() * DAILY_CHALLENGES.length)];
            featuresData.currentDailyChallenge = { ...randomDaily, completed: false };
            featuresData.dailyChallengeDate = today;
        }

        // Weekly challenge
        if (featuresData.weeklyChallengeWeek !== weekNum) {
            const randomWeekly = WEEKLY_CHALLENGES[Math.floor(Math.random() * WEEKLY_CHALLENGES.length)];
            featuresData.currentWeeklyChallenge = { ...randomWeekly, completed: false };
            featuresData.weeklyChallengeWeek = weekNum;
        }

        saveFeaturesData();
    }

    function getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    function checkChallenges(data, goal, todaySeconds) {
        const daily = featuresData.currentDailyChallenge;
        const weekly = featuresData.currentWeeklyChallenge;

        // Check daily
        if (daily && !daily.completed) {
            let completed = false;
            if (daily.target) {
                completed = todaySeconds >= daily.target;
            } else if (daily.type === 'goal_beat') {
                completed = todaySeconds > goal * 60;
            } else if (daily.type === 'early') {
                completed = new Date().getHours() < 9 && todaySeconds > 0;
            }
            if (completed) {
                daily.completed = true;
                showChallengeComplete('Tägliche Challenge', daily.desc);
                saveFeaturesData();
            }
        }

        // Check weekly
        if (weekly && !weekly.completed) {
            const weekSeconds = getWeekSeconds(data);
            let completed = false;
            if (weekly.target && !weekly.type) {
                completed = weekSeconds >= weekly.target;
            } else if (weekly.type === 'streak') {
                completed = getWeekStreak(data, goal) >= weekly.target;
            } else if (weekly.type === 'goals') {
                completed = getWeekGoalHits(data, goal) >= weekly.target;
            }
            if (completed) {
                weekly.completed = true;
                showChallengeComplete('Wöchentliche Challenge', weekly.desc);
                saveFeaturesData();
            }
        }
    }

    function getWeekSeconds(data) {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        weekStart.setHours(0, 0, 0, 0);

        let total = 0;
        Object.keys(data).forEach(k => {
            const d = new Date(k);
            if (d >= weekStart) {
                total += data[k] || 0;
            }
        });
        return total;
    }

    function getWeekStreak(data, goal) {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        
        let streak = 0;
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            const k = d.toISOString().split('T')[0];
            if ((data[k] || 0) >= goal * 60) {
                streak++;
            } else if (d <= now) {
                streak = 0;
            }
        }
        return streak;
    }

    function getWeekGoalHits(data, goal) {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        
        let hits = 0;
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            const k = d.toISOString().split('T')[0];
            if ((data[k] || 0) >= goal * 60) {
                hits++;
            }
        }
        return hits;
    }

    function getChallenges() {
        return {
            daily: featuresData.currentDailyChallenge,
            weekly: featuresData.currentWeeklyChallenge
        };
    }

    // ============================================
    // CELEBRATIONS
    // ============================================
    function celebrate(type) {
        const container = document.getElementById('celebration-container');
        if (!container) return;

        container.innerHTML = '';
        container.style.display = 'block';

        // Create confetti or particles
        const colors = ['#36d1c4', '#5b86e5', '#ffd700', '#ff6b6b', '#4ade80', '#a855f7'];
        
        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.className = 'celebration-particle';
            particle.style.cssText = `
                position: absolute;
                width: ${Math.random() * 10 + 5}px;
                height: ${Math.random() * 10 + 5}px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                left: ${Math.random() * 100}%;
                top: -20px;
                border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
                animation: fall ${Math.random() * 2 + 2}s ease-out forwards;
                animation-delay: ${Math.random() * 0.5}s;
            `;
            container.appendChild(particle);
        }

        setTimeout(() => {
            container.style.display = 'none';
            container.innerHTML = '';
        }, 4000);
    }

    function checkGoalCelebration(todaySeconds, goal) {
        const goalSeconds = goal * 60;
        const today = new Date().toISOString().split('T')[0];
        
        if (todaySeconds >= goalSeconds && featuresData.lastCelebration !== today) {
            featuresData.lastCelebration = today;
            saveFeaturesData();
            celebrate('goal');
            showToast('🎉 Tagesziel erreicht!', 'success');
        }
    }

    // ============================================
    // UI NOTIFICATIONS
    // ============================================
    function showAchievementUnlock(achievement) {
        showToast(`${achievement.icon} ${achievement.name} freigeschaltet!`, 'achievement');
        if (featuresData.notificationSound) {
            playSound('achievement');
        }
        celebrate('achievement');
    }

    function showChallengeComplete(type, desc) {
        showToast(`✅ ${type}: ${desc}`, 'success');
        if (featuresData.notificationSound) {
            playSound('challenge');
        }
    }

    function showToast(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'toast';
        const bgColor = type === 'success' ? '#4ade80' : type === 'achievement' ? '#ffd700' : type === 'warning' ? '#f59e0b' : '#36d1c4';
        toast.style.cssText = `
            background: ${bgColor};
            color: #000;
            padding: 14px 20px;
            border-radius: 10px;
            font-weight: 600;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
            max-width: 300px;
        `;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // ============================================
    // REMINDERS
    // ============================================
    function initReminders() {
        if (reminderIntervalId) {
            clearInterval(reminderIntervalId);
        }
        reminderIntervalId = setInterval(checkReminders, 60000); // Check every minute
    }

    function checkReminders() {
        const now = Date.now();

        // Check sit reminder (remind to stand up)
        if (featuresData.sitReminderEnabled && !window.tracking) {
            const lastReminder = featuresData.lastSitReminder || 0;
            const minutesSinceReminder = (now - lastReminder) / 60000;
            
            if (minutesSinceReminder >= featuresData.sitReminderMinutes) {
                sendReminder('⬆️ Zeit aufzustehen!', 'Du sitzt schon eine Weile. Zeit für eine Steh-Session!');
                featuresData.lastSitReminder = now;
                saveFeaturesData();
            }
        }

        // Check stand break reminder (remind to take a break from standing)
        if (featuresData.standBreakEnabled && window.tracking && window.trackingStart) {
            const standingMinutes = (now - window.trackingStart) / 60000;
            
            if (standingMinutes >= featuresData.standBreakMinutes) {
                const lastBreakReminder = featuresData.lastStandBreakReminder || 0;
                const minutesSinceBreakReminder = (now - lastBreakReminder) / 60000;
                
                if (minutesSinceBreakReminder >= 15) { // Don't spam, wait 15 min between reminders
                    sendReminder('🪑 Pause machen!', `Du stehst schon ${Math.round(standingMinutes)} Minuten. Eine kurze Sitz-Pause tut gut!`);
                    featuresData.lastStandBreakReminder = now;
                    saveFeaturesData();
                }
            }
        }

        // Reset sit reminder when tracking starts
        if (window.tracking) {
            featuresData.lastSitReminder = now;
        }
    }

    async function sendReminder(title, body) {
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '🧍' });
        }

        // In-app toast
        showToast(`${title} ${body}`, 'warning');

        // Sound
        if (featuresData.notificationSound) {
            playSound('reminder');
        }
    }

    async function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            const result = await Notification.requestPermission();
            return result === 'granted';
        }
        return Notification.permission === 'granted';
    }

    function playSound(type) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            if (type === 'achievement') {
                oscillator.frequency.setValueAtTime(523, audioContext.currentTime); // C5
                oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1); // E5
                oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2); // G5
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.4);
            } else if (type === 'reminder') {
                oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
                oscillator.frequency.setValueAtTime(554, audioContext.currentTime + 0.15); // C#5
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.3);
            } else {
                oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.2);
            }
        } catch (e) {
            console.log('Audio not available');
        }
    }

    // ============================================
    // SETTINGS
    // ============================================
    function updateReminderSettings(settings) {
        if (settings.sitReminderEnabled !== undefined) featuresData.sitReminderEnabled = settings.sitReminderEnabled;
        if (settings.sitReminderMinutes !== undefined) featuresData.sitReminderMinutes = settings.sitReminderMinutes;
        if (settings.standBreakEnabled !== undefined) featuresData.standBreakEnabled = settings.standBreakEnabled;
        if (settings.standBreakMinutes !== undefined) featuresData.standBreakMinutes = settings.standBreakMinutes;
        if (settings.notificationSound !== undefined) featuresData.notificationSound = settings.notificationSound;
        saveFeaturesData();
    }

    function getReminderSettings() {
        return {
            sitReminderEnabled: featuresData.sitReminderEnabled,
            sitReminderMinutes: featuresData.sitReminderMinutes,
            standBreakEnabled: featuresData.standBreakEnabled,
            standBreakMinutes: featuresData.standBreakMinutes,
            notificationSound: featuresData.notificationSound,
        };
    }

    // ============================================
    // RENDER UI COMPONENTS
    // ============================================
    function renderAchievementsPanel() {
        const achievements = getAllAchievements();
        const unlocked = achievements.filter(a => a.unlocked).length;
        
        return `
            <div class="achievements-panel">
                <h4>Erfolge (${unlocked}/${achievements.length})</h4>
                <div class="achievements-grid">
                    ${achievements.map(a => `
                        <div class="achievement-badge ${a.unlocked ? 'unlocked' : 'locked'}" title="${a.desc}">
                            <span class="achievement-icon">${a.unlocked ? a.icon : '🔒'}</span>
                            <span class="achievement-name">${a.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderLevelPanel(totalSeconds) {
        const { current, next, progress } = getLevelProgress(totalSeconds);
        const hours = Math.floor(totalSeconds / 3600);
        
        return `
            <div class="level-panel">
                <div class="level-info">
                    <span class="level-icon">${current.icon}</span>
                    <span class="level-name">Level ${current.level}: ${current.name}</span>
                </div>
                <div class="level-progress-bar">
                    <div class="level-progress-fill" style="width: ${progress}%"></div>
                </div>
                ${next ? `<div class="level-next">Nächstes Level: ${next.icon} ${next.name} (${next.minHours}h)</div>` : '<div class="level-next">Max Level erreicht! 🎊</div>'}
                <div class="level-hours">${hours} Stunden total</div>
            </div>
        `;
    }

    function renderChallengesPanel(data, goal, todaySeconds) {
        const { daily, weekly } = getChallenges();
        
        const dailyProgress = daily ? (daily.target ? Math.min(100, (todaySeconds / daily.target) * 100) : (daily.completed ? 100 : 0)) : 0;
        const weeklyProgress = weekly ? (weekly.target && !weekly.type ? Math.min(100, (getWeekSeconds(data) / weekly.target) * 100) : (weekly.completed ? 100 : 0)) : 0;
        
        return `
            <div class="challenges-panel">
                <h4>Challenges</h4>
                ${daily ? `
                    <div class="challenge-item ${daily.completed ? 'completed' : ''}">
                        <span class="challenge-icon">${daily.icon}</span>
                        <div class="challenge-info">
                            <div class="challenge-title">Täglich: ${daily.desc}</div>
                            <div class="challenge-progress-bar">
                                <div class="challenge-progress-fill" style="width: ${dailyProgress}%"></div>
                            </div>
                        </div>
                        <span class="challenge-status">${daily.completed ? '✅' : `${Math.round(dailyProgress)}%`}</span>
                    </div>
                ` : ''}
                ${weekly ? `
                    <div class="challenge-item ${weekly.completed ? 'completed' : ''}">
                        <span class="challenge-icon">${weekly.icon}</span>
                        <div class="challenge-info">
                            <div class="challenge-title">Wöchentlich: ${weekly.desc}</div>
                            <div class="challenge-progress-bar">
                                <div class="challenge-progress-fill" style="width: ${weeklyProgress}%"></div>
                            </div>
                        </div>
                        <span class="challenge-status">${weekly.completed ? '✅' : `${Math.round(weeklyProgress)}%`}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function renderReminderSettings() {
        const settings = getReminderSettings();
        
        return `
            <div class="reminder-settings">
                <h3>Erinnerungen</h3>
                
                <div class="setting-row">
                    <label>
                        <input type="checkbox" id="sitReminderEnabled" ${settings.sitReminderEnabled ? 'checked' : ''}>
                        Steh-Erinnerung (wenn zu lange gesessen)
                    </label>
                </div>
                <div class="setting-row">
                    <label>Nach Minuten:</label>
                    <input type="number" id="sitReminderMinutes" value="${settings.sitReminderMinutes}" min="5" max="180" style="width:80px">
                </div>
                
                <div class="setting-row" style="margin-top:15px">
                    <label>
                        <input type="checkbox" id="standBreakEnabled" ${settings.standBreakEnabled ? 'checked' : ''}>
                        Pausen-Erinnerung (wenn zu lange gestanden)
                    </label>
                </div>
                <div class="setting-row">
                    <label>Nach Minuten:</label>
                    <input type="number" id="standBreakMinutes" value="${settings.standBreakMinutes}" min="15" max="180" style="width:80px">
                </div>
                
                <div class="setting-row" style="margin-top:15px">
                    <label>
                        <input type="checkbox" id="notificationSound" ${settings.notificationSound ? 'checked' : ''}>
                        Sound bei Benachrichtigungen
                    </label>
                </div>
                
                <button class="btn btn-ghost" onclick="Features.requestNotificationPermission().then(r => Features.showToast(r ? 'Benachrichtigungen aktiviert!' : 'Bitte im Browser erlauben', r ? 'success' : 'warning'))" style="margin-top:10px">
                    Benachrichtigungen aktivieren
                </button>
                
                <button class="btn btn-main" onclick="Features.saveReminderSettings()" style="margin-top:10px;margin-left:10px">
                    Speichern
                </button>
            </div>
        `;
    }

    function saveReminderSettings() {
        updateReminderSettings({
            sitReminderEnabled: document.getElementById('sitReminderEnabled')?.checked || false,
            sitReminderMinutes: parseInt(document.getElementById('sitReminderMinutes')?.value) || 45,
            standBreakEnabled: document.getElementById('standBreakEnabled')?.checked || false,
            standBreakMinutes: parseInt(document.getElementById('standBreakMinutes')?.value) || 60,
            notificationSound: document.getElementById('notificationSound')?.checked || true,
        });
        showToast('Einstellungen gespeichert!', 'success');
    }

    // ============================================
    // CSS INJECTION
    // ============================================
    function injectStyles() {
        if (document.getElementById('features-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'features-styles';
        style.textContent = `
            @keyframes fall {
                to { transform: translateY(100vh) rotate(720deg); opacity: 0; }
            }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            
            #celebration-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 9998;
                overflow: hidden;
            }
            
            .achievements-panel, .level-panel, .challenges-panel {
                background: var(--bg);
                border-radius: var(--rs);
                padding: 16px;
                margin: 15px 0;
                border: 1px solid #30363d;
            }
            
            .achievements-panel h4, .challenges-panel h4 {
                margin: 0 0 12px 0;
                color: var(--fg);
            }
            
            .achievements-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                gap: 10px;
            }
            
            .achievement-badge {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 12px 8px;
                background: var(--bg2);
                border-radius: 8px;
                border: 1px solid #30363d;
                transition: transform 0.2s;
            }
            
            .achievement-badge.unlocked {
                border-color: var(--p1);
                box-shadow: 0 0 10px rgba(54, 209, 196, 0.3);
            }
            
            .achievement-badge.locked {
                opacity: 0.5;
            }
            
            .achievement-badge:hover {
                transform: scale(1.05);
            }
            
            .achievement-icon {
                font-size: 1.8rem;
                margin-bottom: 6px;
            }
            
            .achievement-name {
                font-size: 0.75rem;
                text-align: center;
                color: var(--fg2);
            }
            
            .level-panel {
                text-align: center;
            }
            
            .level-info {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                margin-bottom: 12px;
            }
            
            .level-icon {
                font-size: 2rem;
            }
            
            .level-name {
                font-size: 1.2rem;
                font-weight: 700;
                color: #fff;
            }
            
            .level-progress-bar, .challenge-progress-bar {
                height: 8px;
                background: #21262d;
                border-radius: 4px;
                overflow: hidden;
                margin: 8px 0;
            }
            
            .level-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, var(--p1), var(--p2));
                transition: width 0.5s ease;
            }
            
            .challenge-progress-fill {
                height: 100%;
                background: var(--p1);
                transition: width 0.3s ease;
            }
            
            .level-next, .level-hours {
                font-size: 0.85rem;
                color: var(--fg2);
            }
            
            .challenge-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: var(--bg2);
                border-radius: 8px;
                margin-bottom: 10px;
                border: 1px solid #30363d;
            }
            
            .challenge-item.completed {
                border-color: #4ade80;
                background: rgba(74, 222, 128, 0.1);
            }
            
            .challenge-icon {
                font-size: 1.5rem;
            }
            
            .challenge-info {
                flex: 1;
            }
            
            .challenge-title {
                font-weight: 600;
                margin-bottom: 6px;
            }
            
            .challenge-status {
                font-weight: 700;
                color: var(--p1);
            }
            
            .reminder-settings .setting-row {
                margin: 10px 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .reminder-settings input[type="checkbox"] {
                width: 18px;
                height: 18px;
                accent-color: var(--p1);
            }
            
            .reminder-settings label {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================
    // INIT
    // ============================================
    function init() {
        injectStyles();
        loadFeaturesData();
        initReminders();
        
        // Add celebration container
        if (!document.getElementById('celebration-container')) {
            const container = document.createElement('div');
            container.id = 'celebration-container';
            container.style.display = 'none';
            document.body.appendChild(container);
        }
    }

    // Auto-init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================
    // PUBLIC API
    // ============================================
    return {
        checkAchievements,
        checkChallenges,
        checkGoalCelebration,
        checkReminders,
        getUnlockedAchievements,
        getAllAchievements,
        getLevel,
        getLevelProgress,
        getChallenges,
        calculateStats,
        renderAchievementsPanel,
        renderLevelPanel,
        renderChallengesPanel,
        renderReminderSettings,
        saveReminderSettings,
        updateReminderSettings,
        getReminderSettings,
        requestNotificationPermission,
        showToast,
        celebrate,
        init,
    };
})();
