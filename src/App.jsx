import React, { useEffect, useRef, useState, useCallback } from "react";
import './App.css';
import playerImgSrc from "./assets/images/player-def.png";
import playerJumpImgSrc from "./assets/images/player-jump.png";
import bg0 from "./assets/images/bg-image0.jpg";
// 게임 설정
const GAME_WIDTH = 360;
const GAME_HEIGHT = 640;
const PLAYER_SIZE = 80;
const PLAYER_HITBOX = 24;
const GRAVITY = 0.5;
const JUMP_POWER = -11; // 발판을 밟기 위한 점프
const MOVE_SPEED = 5;

// 변경: 지각(0~35km)은 40px = 1km (4배 느림)
// 변경: 맨틀~(35km~)은 2.5px = 1km (4배 빠름)
function getKmFromPixels(pixels) {
  // 35km 지점은 픽셀로 1400px (35 * 40)
  if (pixels <= 1400) return pixels / 40; 
  return 35 + (pixels - 1400) / 2.5; 
}

function getPixelsFromKm(km) {
  if (km <= 35) return km * 40;
  return 1400 + (km - 35) * 2.5;
}

// 6400km(내핵 도달)에 필요한 실제 픽셀 수 (약 17312.5 픽셀)
const CORE_PIXEL_DEPTH = getPixelsFromKm(6400);

// 지질층 도트 타일 생성 함수
const generatePixelTexture = (layer) => {
  const canvas = document.createElement("canvas");
  const size = 64; // 타일 한 칸의 크기
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  
  // 8x8 픽셀 그리드로 도트 느낌 내기
  const p = 8; 
  const drawDot = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * p, y * p, p, p);
  };

  if (layer === "crust") {
    // [지각] 어두운 흙과 듬성듬성 박힌 돌멩이
    ctx.fillStyle = "#5D4037"; 
    ctx.fillRect(0, 0, size, size);
    const darkRocks = [[1,1],[2,1],[1,2], [5,4],[6,4],[6,5], [3,6],[0,7],[7,0]];
    const lightRocks = [[2,2], [5,5], [4,7]];
    darkRocks.forEach(([x, y]) => drawDot(x, y, "#3E2723"));
    lightRocks.forEach(([x, y]) => drawDot(x, y, "#795548"));

  } else if (layer === "mantle") {
    // [맨틀] 붉은 마그마와 주황색 대류 흐름선
    ctx.fillStyle = "#B71C1C"; 
    ctx.fillRect(0, 0, size, size);
    const wave1 = [[0,1],[1,1],[2,2],[3,2],[4,1],[5,1],[6,2],[7,2]];
    const wave2 = [[0,5],[1,6],[2,6],[3,5],[4,5],[5,6],[6,6],[7,5]];
    wave1.forEach(([x, y]) => drawDot(x, y, "#D84315"));
    wave2.forEach(([x, y]) => drawDot(x, y, "#FF5722"));

  } else if (layer === "outerCore") {
    // [외핵] 액체 금속 느낌의 물방울 패턴
    ctx.fillStyle = "#E65100"; 
    ctx.fillRect(0, 0, size, size);
    const drops = [[2,1],[2,2], [6,4],[6,5],[6,6], [1,6]];
    const highlights = [[2,1], [6,4]];
    drops.forEach(([x, y]) => drawDot(x, y, "#FFB300"));
    highlights.forEach(([x, y]) => drawDot(x, y, "#FFF176"));

  } else if (layer === "innerCore") {
    // [내핵] 거대한 압력으로 압축된 눈부신 고체 결정 (다이아몬드/십자 형태)
    ctx.fillStyle = "#FFF9C4"; 
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 8; i++) {
      drawDot(i, i, "#FFFFFF");
      drawDot(7 - i, i, "#FFFFFF");
    }
    // 중심부 코어
    drawDot(3, 3, "#FFEB3B"); drawDot(4, 3, "#FFEB3B");
    drawDot(3, 4, "#FFEB3B"); drawDot(4, 4, "#FFEB3B");
  }

  // 그려진 캔버스를 Base64 이미지 URL로 반환
  return canvas.toDataURL("image/png");
};

export default function App() {
  const canvasRef = useRef(null);
  const keys = useRef({ left: false, right: false, jump: false });
  const animationRef = useRef(null);
  const [running, setRunning] = useState(true);
  const [score, setScore] = useState(0); // 현재 깊이 (km)
  // 최고 기록 상태 (로컬 스토리지와 연동) ---
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem("earthExplorerHighScore");
    return saved ? parseFloat(saved) : 0;
  });

  const images = useRef({
    def: new Image(),
    jump: new Image(),
    bg0: new Image(),
    crust: new Image(),
    mantle: new Image(),
    outerCore: new Image(),
    innerCore: new Image(),
  })

  // 깊이에 따른 지질층 이름 및 설명 계산
  const depthNum = parseFloat(score);
  let layerName = "";
  let layerDesc = "";

  if (depthNum < 35) {
    layerName = "지각";
    layerDesc = "지구의 가장 바깥층입니다. 우리가 딛고 서 있는 단단한 암석 지대죠.";
  } else if (depthNum < 2900) {
    layerName = "맨틀";
    layerDesc = "지구 부피의 80%를 차지합니다. 뜨거운 암석이 천천히 대류하고 있어요.";
  } else if (depthNum < 5100) {
    layerName = "외핵";
    layerDesc = "액체 상태의 철과 니켈로 이루어져 있습니다. 지구의 자기장을 만들죠.";
  } else {
    layerName = "내핵";
    layerDesc = "지구의 중심입니다. 엄청난 압력 때문에 고체 상태의 금속으로 존재합니다.";
  }

  const gameState = useRef(null);

  // 게임 초기화
  const initGame = useCallback(() => {
    const platforms = [];

    // 첫 번째 발판 (시작 위치)
    const firstPlatX = GAME_WIDTH / 2 - 40;
    const firstPlatY = GAME_HEIGHT / 2;

    platforms.push({ 
      x: firstPlatX, 
      y: firstPlatY, 
      width: 80, 
      height: 12 
    });

    // 아래 방향(+y)으로 발판 1000개 생성
    for (let i = 1; i < 1000; i++) {
      const yPos = firstPlatY + i * 130;

      // [수정] 64400 대신 계산된 CORE_PIXEL_DEPTH 사용
      if (yPos >= firstPlatY + CORE_PIXEL_DEPTH) {
        platforms.push({
          x: 0,
          y: yPos,
          width: GAME_WIDTH,
          height: 40,
          isCore: true
        });
        break;
      }

      platforms.push({
        x: Math.random() * (GAME_WIDTH - 80),
        y: yPos,
        width: 80,
        height: 10,
      });
    }

    // 플레이어를 첫 번째 발판 바로 위(y좌표)에 배치하여 시작 시 추락하는 현상 제거
    const playerStartX = GAME_WIDTH / 2 - 20;
    const playerStartY = firstPlatY - PLAYER_HITBOX;

    gameState.current = {
      player: { 
        x: playerStartX,
        y: playerStartY,
        vy: 0,
        prevY: playerStartY,
        jumpCount: 0,
        onGround: true },
      platforms,
      totalDepth: 0,
      cameraY: 0,
      startY: playerStartY,
      reachedCore: false
    };

    setScore(0);
    setRunning(true);
  }, []);

  // 컴포넌트 마운트 시 최초 1회 실행
  useEffect(() => {
    // 0초 타이머를 주어 현재의 렌더링이 완전히 끝난 뒤 실행되게 합니다.
    const timer = setTimeout(() => {
      initGame();
    }, 0);

    return () => clearTimeout(timer); // 언마운트 시 타이머 청소
  }, [initGame]);

  useEffect(() => {
    images.current.def.src = playerImgSrc;
    images.current.jump.src = playerJumpImgSrc;
    images.current.bg0.src = bg0;
    images.current.crust.src = generatePixelTexture("crust");
    images.current.mantle.src = generatePixelTexture("mantle");
    images.current.outerCore.src = generatePixelTexture("outerCore");
    images.current.innerCore.src = generatePixelTexture("innerCore");
  }, []);

  // 키보드 이벤트
  useEffect(() => {
    const down = (e) => {
      if (e.key === "ArrowLeft") keys.current.left = true;
      if (e.key === "ArrowRight") keys.current.right = true;
      if (e.code === "Space") keys.current.jump = true;
    };
    const up = (e) => {
      if (e.key === "ArrowLeft") keys.current.left = false;
      if (e.key === "ArrowRight") keys.current.right = false;
      if (e.code === "Space") keys.current.jump = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // 게임 루프
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");

    const loop = () => {
      if (!running) return;

      const state = gameState.current;
      if (!state) {
        animationRef.current = requestAnimationFrame(loop);
        return;
      }
      const p = state.player;
      p.onGround = false;

      // 1. 이동 및 물리
      if (keys.current.left) p.x -= MOVE_SPEED;
      if (keys.current.right) p.x += MOVE_SPEED;
      if (p.x < -20) p.x = -20;
      if (p.x > GAME_WIDTH - PLAYER_HITBOX + 20) p.x = GAME_WIDTH - PLAYER_HITBOX + 20;

      p.prevY = p.y;
      p.vy += GRAVITY;
      p.y += p.vy;

      // 2. 플랫폼 충돌 (위에서 아래로 떨어질 때만)
      state.platforms.forEach((plat) => {
        if (p.vy > 0 && p.prevY + PLAYER_HITBOX <= plat.y + 5 && p.y + PLAYER_HITBOX >= plat.y) {
          if (p.x + PLAYER_HITBOX > plat.x && p.x < plat.x + plat.width) {
            p.y = plat.y - PLAYER_HITBOX;
            p.vy = 0;
            p.jumpCount = 0;
            p.onGround = true;
          }
        }
      });

      // 점프
      if (keys.current.jump && p.jumpCount < 2) {
        p.vy = JUMP_POWER;
        p.jumpCount++;
        keys.current.jump = false;
      }

      // 3. [핵심] 내려가기 카메라 로직
      const scrollThreshold = GAME_HEIGHT / 2; // 화면 위쪽 50% 지점
      if (p.onGround && p.y > scrollThreshold && state.totalDepth < CORE_PIXEL_DEPTH) {
        const targetDiff = p.y - scrollThreshold;
  
        // 보간율(0.1): 매 프레임 남은 거리의 10%씩 이동 (숫자가 작을수록 부드러움)
        const lerpAmount = 0.1; 
        const smoothDiff = targetDiff * lerpAmount;

        p.y -= smoothDiff; // 플레이어 위치 보정
        state.platforms.forEach((plat) => (plat.y -= smoothDiff)); // 발판 이동
        state.totalDepth += smoothDiff;
      }

      if (state.totalDepth >= CORE_PIXEL_DEPTH) {
        state.totalDepth = CORE_PIXEL_DEPTH;
        state.reachedCore = true;
      }
      // 4. 게임 오버 (발판을 못밝고 화면 아래에 부딛히는 경우)
      if (p.y > GAME_HEIGHT) {
        setRunning(false);

        // 게임이 끝나는 정확한 순간에 최고 기록을 평가하고 저장합니다 ---
        const finalScore = getKmFromPixels(state.totalDepth);
        
        // 이전 최고 기록(prev)과 비교하여 갱신합니다.
        setHighScore((prevHighScore) => {
          if (finalScore > prevHighScore) {
            localStorage.setItem("earthExplorerHighScore", finalScore.toString());
            return finalScore;
          }
          return prevHighScore; 
        });
      }

      // 점수 업데이트 (100px = 10km로 환산)
      const currentDepth = getKmFromPixels(state.totalDepth);
      setScore(currentDepth.toFixed(2));

      // 5. 그리기
      // --- [1단계] 지질층 타일 배경 먼저 그리기 (제일 뒤쪽) ---
      let currentBgImg = null;
      if (currentDepth < 35) currentBgImg = images.current.crust;
      else if (currentDepth < 2900) currentBgImg = images.current.mantle;
      else if (currentDepth < 5100) currentBgImg = images.current.outerCore;
      else currentBgImg = images.current.innerCore;

      if (currentBgImg && currentBgImg.complete && currentBgImg.naturalHeight > 0) {
        const parallaxSpeed = 0.5; 
        const offsetY = (state.totalDepth * parallaxSpeed) % currentBgImg.naturalHeight;
        for (let y = -offsetY; y < GAME_HEIGHT; y += currentBgImg.naturalHeight) {
          for (let x = 0; x < GAME_WIDTH; x += currentBgImg.naturalWidth) {
            ctx.drawImage(currentBgImg, x, y);
          }
        }
      } else {
        const redness = Math.min(currentDepth / 20, 150);
        ctx.fillStyle = `rgb(${40 + redness}, ${25 - redness/4}, 10)`;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      }

      // --- [2단계] 지표면 하늘 이미지 그리기 ---
      const bg = images.current.bg0;
      if (bg.complete && bg.src) {
        const bgY = -state.totalDepth;
        const bgHeight = GAME_HEIGHT / 2;
        if (bgY + bgHeight > 0) {
          ctx.drawImage(bg, 0, bgY, GAME_WIDTH, bgHeight);
        }
      }

      // --- [3단계] 발판 그리기 (배경 위에 덮어쓰기) ---
      state.platforms.forEach((plat) => {
        // 1. 발판 내부 색상 (배경보다 밝은 갈색으로 변경)
        ctx.fillStyle = "#8D6E63"; 
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);

        // 2. 발판 테두리 추가 (눈에 확실히 띄게 만듦)
        ctx.strokeStyle = "#3E2723";
        ctx.lineWidth = 2;
        ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
      });

      // --- [4단계] 캐릭터 그리기 (제일 앞쪽) ---
      const currentImg = p.onGround ? images.current.def : images.current.jump;
      if (currentImg.complete) {
        ctx.drawImage(
          currentImg,
          p.x - (PLAYER_SIZE - PLAYER_HITBOX) / 2, 
          p.y - (PLAYER_SIZE - PLAYER_HITBOX),      
          PLAYER_SIZE,
          PLAYER_SIZE
        );
      } else {
        ctx.fillStyle = "#ffeb3b";
        ctx.fillRect(p.x, p.y, PLAYER_HITBOX, PLAYER_HITBOX);
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  }, [running, depthNum]);

  return (
    <div className="earth-game-container">
      {/* 1. 제목: 중앙 상단 */}
      <h1 className="earth-game-title">
        지구 내부 탐험
      </h1>

      {/* 2. 게임 + 정보창 컨테이너 */}
      <div className="earth-game-layout">
        
        {/* [왼쪽] 게임 화면 (Canvas) */}
        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            style={{ display: 'block' }}
          />
          {/* 게임오버 오버레이 */}
          {!running && (
            <div className="game-over-overlay">
              <h2 className="game-over-title">탐사 실패</h2>
            </div>
          )}
        </div>

        {/* [오른쪽] 정보 패널 */}
        <div 
          className="info-panel"
          style={{ width: `${GAME_WIDTH}px`, height: `${GAME_HEIGHT}px` }} 
        >
          {/* 현재 상태 정보 */}
          <div style={{ marginBottom: '25px' }}>
            <p className="layer-name-label">현재위치</p>
            <div className="layer-name-value">{layerName}</div>
          </div>

          {/* 현재 깊이 & 최고 기록 (나란히 배치) */}
          <div className="depth-container">
            <div>
              <p className="info-label">현재 깊이</p>
              <div className="depth-value-wrapper">
                <span className="current-depth-number">{score}</span> km
              </div>
            </div>

            <div>
              <p className="info-label">최고 깊이</p>
              <div className="depth-value-wrapper">
                <span className="high-depth-number">
                  {Math.max(parseFloat(score) || 0, highScore).toFixed(2)}
                </span> km
              </div>
            </div>
          </div>

          {/* 지질 정보 가이드 */}
          <div className="layer-desc-box">
            <strong className="layer-desc-title">[ {layerName} 정보 ]</strong>
            {layerDesc}
          </div>

          {/* 버튼 및 상태 정보 */}
          <div className="status-area">
            {!running ? (
              <button 
                className="restart-btn"
                onClick={initGame} 
              >
                다시 탐험 시작
              </button>
            ) : (
              <div className="playing-status-text">
                {depthNum >= 6400 ? "🎉 축하합니다! 지구 중심에 도달했습니다!" : "⚠️ 아래로 더 깊이 내려가세요!"}
              </div>
            )}
          </div>

          {/* 하단 단축키 가이드 */}
          <div className="controls-guide">
            <div className="control-item">
              <span>이동</span> <span className="control-key">방향키 좌우</span>
            </div>
            <div className="control-item" style={{ marginBottom: 0 }}>
              <span>점프</span> <span className="control-key">Space Bar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}