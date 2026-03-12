/* ===== 背景光球装饰 ===== */
body::before {
    content: '';
    position: fixed;
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(216,145,239,0.45) 0%, transparent 70%);
    top: -150px; right: -100px;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
}

body::after {
    content: '';
    position: fixed;
    width: 400px; height: 400px;
    background: radial-gradient(circle, rgba(249,168,212,0.5) 0%, transparent 70%);
    bottom: -100px; left: -100px;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
}

/* ===== 便当盒统一入场动画 ===== */
@keyframes cardFadeUp {
    from {
        opacity: 0;
        transform: translateY(22px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.card {
    animation: cardFadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* 每张卡片错开延迟，形成瀑布感 */
.card:nth-child(1) { animation-delay: 0.05s; }
.card:nth-child(2) { animation-delay: 0.15s; }
.card:nth-child(3) { animation-delay: 0.25s; }
.card:nth-child(4) { animation-delay: 0.35s; }
.card:nth-child(5) { animation-delay: 0.45s; }

/* ===== 纪念卡脉冲动画（特殊日子用）===== */
@keyframes cardPulse {
    0%, 100% { transform: scale(1); box-shadow: 0 4px 16px rgba(200,100,180,0.15); }
    50% { transform: scale(1.04); box-shadow: 0 6px 24px rgba(200,100,180,0.35); }
}

/* ===== Main Screen (Bento Grid) ===== */
.main-content {
    padding: 20px;
    padding-bottom: calc(60px + env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: 2fr 1fr;
    grid-gap: 15px;
    overflow-y: scroll;
    -webkit-overflow-scrolling: touch;
    background: transparent;
    height: 100%;
    align-content: start;
}

.card {
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 20px;
    padding: 25px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 8px 25px rgba(180, 120, 200, 0.15), inset 0 1px 0 rgba(255,255,255,0.9);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    min-height: 140px;
    border: 1px solid rgba(255, 255, 255, 0.7);
}

.card:hover {
    transform: translateY(-6px);
    box-shadow: 0 20px 40px rgba(180, 120, 200, 0.25), inset 0 1px 0 rgba(255,255,255,0.9);
    border-color: rgba(216, 145, 239, 0.7);
    background: rgba(255, 255, 255, 0.65);
}

.card:active {
    transform: scale(0.96);
    box-shadow: 0 4px 12px rgba(180, 120, 200, 0.2), inset 0 1px 0 rgba(255,255,255,0.9);
    transition: all 0.1s ease;
}

.card-large {
    grid-column: 1;
    grid-row: 1 / 3;
    min-height: auto;
    background: linear-gradient(135deg, rgba(216,180,254,0.4), rgba(249,168,212,0.35));
    border: 1px solid rgba(255, 255, 255, 0.7);
    box-shadow: 0 8px 32px rgba(180, 120, 200, 0.2), inset 0 1px 0 rgba(255,255,255,0.9);
}

.card-icon {
    font-size: 48px;
    margin-bottom: 12px;
}

.card-title {
    font-size: 16px;
    font-weight: 700;
    color: #6b3fa0;
    margin-bottom: 3px;
}

.card-desc {
    font-size: 12px;
    color: #a07cc0;
}

/* ===== 特殊卡片颜色 ===== */
.achievement-card {
    background: linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,180,50,0.12)) !important;
    border: 1px solid rgba(255,200,50,0.35) !important;
}

.secret-card {
    background: linear-gradient(135deg, rgba(255,220,240,0.55), rgba(216,180,254,0.45)) !important;
    border: 1.5px solid rgba(255,180,220,0.5) !important;
}

.work-card {
    background: linear-gradient(135deg, rgba(254,240,255,0.8), rgba(224,242,255,0.75)) !important;
}

.vocab-card {
    background: linear-gradient(135deg, rgba(240,255,245,0.8), rgba(220,240,255,0.75)) !important;
}

/* ===== 响应式：手机小屏 ===== */
@media (max-width: 480px) {
    .card-large {
        grid-column: 1 / -1;
        grid-row: 1 / 2;
        min-height: 180px;
    }
    .main-content {
        grid-template-columns: 1fr 1fr;
        padding: 12px;
        gap: 10px;
    }
    .card {
        padding: 12px;
        border-radius: 12px;
        min-height: 80px;
    }
    .card-icon  { font-size: 24px; margin-bottom: 6px; }
    .card-title { font-size: 13px; }
    .card-desc  { font-size: 10px; }
}
