import React, { useRef, useEffect } from 'react';
import fieldTexture from './assets/Field.png';

const SOCCER_BALL_IMG = 'https://images.rawpixel.com/image_png_social_square/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIzLTA3L2pvYjY4MS0wMDYwLXAucG5n.png';
//'https://assets.bwbx.io/images/users/iqjWHBFdfxIU/i7j7kIBS2BF8/v0/-1x-1.webp';

function GameField({
  FIELD_WIDTH,
  FIELD_HEIGHT,
  PEG_RADIUS,
  BALL_RADIUS,
  pegs,
  ballPos,
  dragging,
  setDragging,
  dragStart,
  setDragStart,
  dragEnd,
  setDragEnd,
  isTouch,
  setIsTouch, // add this prop
  playerNumber,
  canShoot, // add this prop
  handleMouseDown,
  handleMouseMove,
  handleTouchStart,
  handleTouchMove,
  svgRef,
  ballAngle = 0, // new prop for rotation
  clutchActive = false,
}) {
  // Canvas ref for the ball
  const ballCanvasRef = useRef();
  

  useEffect(() => {
    const canvas = ballCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = new window.Image();
    img.src = SOCCER_BALL_IMG;
    img.onload = () => {
      ctx.save();
      // Move to center
      ctx.translate(BALL_RADIUS, BALL_RADIUS);
      ctx.rotate((ballAngle * Math.PI) / 180);
      
      // Add subtle drop shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;
      
      // Clip to circle
      ctx.beginPath();
      ctx.arc(0, 0, BALL_RADIUS, 0, 2 * Math.PI);
      ctx.closePath();
      ctx.clip();
      
      // Draw image centered
      ctx.drawImage(img, -BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      ctx.restore();
    };
  }, [ballPos.x, ballPos.y, ballAngle, BALL_RADIUS]);

  // State for animated clutch wiggle
  const [clutchWiggle, setClutchWiggle] = React.useState(0);
  React.useEffect(() => {
    let animId;
    if (clutchActive && dragging) {
      const start = performance.now();
      const animate = (now) => {
        // 10px amplitude, 2Hz frequency
        const t = (now - start) / 1000;
        setClutchWiggle(Math.sin(t * 2 * Math.PI * 2) * 10);
        animId = requestAnimationFrame(animate);
      };
      animId = requestAnimationFrame(animate);
    } else {
      setClutchWiggle(0);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [clutchActive, dragging]);

  // Calculate scale factor for responsive layout
  const containerRef = useRef();
  // Remove scale state and updateScale effect (no longer needed)

  // Responsive CSS for desktop/mobile
  const responsiveStyle = `
    .binho-field-container {
      position: relative;
      background: transparent;
      border-radius: 20px;
      overflow: hidden;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 24px #0006;
      box-sizing: border-box;
      
      /* Fill the available space in the container */
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      
      /* Ensure minimum usable size */
      min-width: 300px;
      min-height: 200px;
    }
    
    .binho-field-container > svg {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      display: block;
      box-sizing: border-box;
      object-fit: contain;
      /* Maintain aspect ratio within container */
      aspect-ratio: 3/5;
    }
    
    /* Desktop styles */
    @media (min-width: 701px) {
      .binho-field-container {
        width: 100%;
        max-width: 420px;
        max-height: 700px;
        margin: 0 auto;
        display: block;
        box-shadow: 0 4px 24px #0006;
        border-radius: 20px;
        aspect-ratio: 3/5;
        height: auto;
        background: transparent;
        box-sizing: border-box;
      }
      
      .binho-field-container > svg {
        width: 100%;
        max-width: 420px;
        max-height: 700px;
        height: auto;
        display: block;
        box-sizing: border-box;
        aspect-ratio: auto;
      }
    }
    
    /* Handle very small screens */
    @media (max-width: 400px) {
      .binho-field-container {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        border-radius: 12px;
        box-shadow: none;
      }
      
      .binho-field-container > svg {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
      }
    }
    
    /* Handle orientation changes */
    @media (orientation: landscape) and (max-height: 500px) {
      .binho-field-container {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
      }
    }
    
    /* Support for devices with notches/safe areas */
    @supports (padding: max(0px)) {
      .binho-field-container {
        padding-left: max(0px, env(safe-area-inset-left));
        padding-right: max(0px, env(safe-area-inset-right));
        padding-top: max(0px, env(safe-area-inset-top));
        padding-bottom: max(0px, env(safe-area-inset-bottom));
      }
    }
  `;

  // Utility to convert client (screen) coordinates to SVG coordinates
  function getSvgCoords(clientX, clientY) {
    const svg = svgRef && svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: svgP.x, y: svgP.y };
  }

  // Allow drag from anywhere on the field
  const handlePointerDown = (e) => {
    if (typeof canShoot === 'function' && !canShoot()) return;
    let clientX, clientY;
    if (e.touches && e.touches.length === 1) {
      if (typeof setIsTouch === 'function') setIsTouch(true);
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.clientX !== undefined) {
      if (typeof setIsTouch === 'function') setIsTouch(false);
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    const { x, y } = getSvgCoords(clientX, clientY);
    setDragging(true);
    setDragStart({ x, y });
    setDragEnd({ x, y });
  };

  return (
    <>
      <style>{responsiveStyle}</style>
              <div ref={containerRef} className="binho-field-container">

        {/* Grass background behind SVG */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: -1,
            backgroundImage: `url(${fieldTexture})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            borderRadius: 20,
            pointerEvents: 'none',
          }}
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}`}
          width="100%"
          height="100%"

          style={{
            borderRadius: 20,
            display: 'block',
            touchAction: 'none',
            transform: playerNumber === 2 ? 'rotate(180deg)' : 'none',
            position: 'relative',
            margin: 'auto',
            zIndex: 10,
          }}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          onTouchMove={handleTouchMove}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Arrowhead marker for drag line */}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth">
              <polygon points="0,0 8,4 0,8" fill="#b5f200" />
            </marker>
          </defs>
          {/* Field outline */}
          <rect x="0" y="0" width={FIELD_WIDTH} height={FIELD_HEIGHT} rx="20" fill="none" stroke="#fff" strokeWidth="6" />

          {/* Center line */}
          <line x1={0} y1={FIELD_HEIGHT/2} x2={FIELD_WIDTH} y2={FIELD_HEIGHT/2} stroke="#fff" strokeWidth="3" />
          {/* Center circle (larger) */}
          <circle cx={FIELD_WIDTH/2} cy={FIELD_HEIGHT/2} r="90" stroke="#fff" strokeWidth="3" fill="none" />
          {/* Outer 18yd box - Top */}
          <rect x={FIELD_WIDTH/2-90} y={0} width="180" height="110" stroke="#fff" strokeWidth="3" fill="none" />
          {/* Inner 6yd box - Top */}
          <rect x={FIELD_WIDTH/2-45} y={0} width="90" height="45" stroke="#fff" strokeWidth="3" fill="none" />
          {/* Outer 18yd box - Bottom */}
          <rect x={FIELD_WIDTH/2-90} y={FIELD_HEIGHT-110} width="180" height="110" stroke="#fff" strokeWidth="3" fill="none" />
          {/* Inner 6yd box - Bottom */}
          <rect x={FIELD_WIDTH/2-45} y={FIELD_HEIGHT-45} width="90" height="45" stroke="#fff" strokeWidth="3" fill="none" />
          {/* Top goal */}
          <rect x={FIELD_WIDTH/2-36} y={-18} width="72" height="18" stroke="#fff" strokeWidth="3" fill="none" />
          {/* Bottom goal */}
          <rect x={FIELD_WIDTH/2-36} y={FIELD_HEIGHT} width="72" height="18" stroke="#fff" strokeWidth="3" fill="none" />
          {/* Pegs */}
          {pegs.map((peg, i) => (
            <circle key={i} cx={peg.x} cy={peg.y} r={PEG_RADIUS} fill="#eee" stroke="#888" strokeWidth="2" />
          ))}
          {/* Drag line (show for both mouse and touch) */}
          {dragging && dragStart && dragEnd && (() => {
            // Calculate wiggle offset for clutch
            let wiggleX = 0, wiggleY = 0;
            if (clutchActive) {
              // Arrow direction
              const dx = dragStart.x - dragEnd.x;
              const dy = dragStart.y - dragEnd.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              // Perpendicular vector
              const perpX = -dy / len;
              const perpY = dx / len;
              wiggleX = perpX * clutchWiggle;
              wiggleY = perpY * clutchWiggle;
            }
            // Calculate drag vector - the arrow should point in the direction the ball will travel
            let dx = dragStart.x - dragEnd.x;
            let dy = dragStart.y - dragEnd.y;
            return (
              <line
                x1={ballPos.x}
                y1={ballPos.y}
                x2={ballPos.x + dx + wiggleX}
                y2={ballPos.y + dy + wiggleY}
                stroke={clutchActive ? 'orange' : '#b5f200'}
                strokeWidth="4"
                markerEnd="url(#arrowhead)"
              />
            );
          })()}
          {/* Debug: Draw a small red circle at the true center of the ball */}
          <circle cx={ballPos.x} cy={ballPos.y} r="3" fill="red" />
          {/* Ball image rendered as SVG <image> with rotation for rolling effect and circular mask */}
          <defs>
            <clipPath id="ball-clip">
              <circle cx={ballPos.x} cy={ballPos.y} r={BALL_RADIUS} />
            </clipPath>
          </defs>
          <image
            href={SOCCER_BALL_IMG}
            x={ballPos.x - BALL_RADIUS}
            y={ballPos.y - BALL_RADIUS}
            width={BALL_RADIUS * 2}
            height={BALL_RADIUS * 2}
            style={{
              transform: `rotate(${ballAngle}deg)`,
              transformOrigin: `${ballPos.x}px ${ballPos.y}px`,
              pointerEvents: 'none',
            }}
            clipPath="url(#ball-clip)"
          />
        </svg>
      </div>
    </>
  );
}

export default GameField; 