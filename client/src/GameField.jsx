import React, { useRef, useEffect } from 'react';
import fieldTexture from './assets/field.png';

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
  dragStart,
  dragEnd,
  isTouch,
  playerNumber,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
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
  const [scale, setScale] = React.useState(1);
  useEffect(() => {
    function updateScale() {
      if (!containerRef.current) return;
      const parent = containerRef.current.parentElement;
      if (!parent) return;
      const parentWidth = parent.offsetWidth;
      const parentHeight = parent.offsetHeight;
      const scaleW = parentWidth / FIELD_WIDTH;
      const scaleH = parentHeight / FIELD_HEIGHT;
      setScale(Math.min(scaleW, scaleH, 1));
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [FIELD_WIDTH, FIELD_HEIGHT]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: FIELD_WIDTH,
        height: FIELD_HEIGHT,
        margin: '0 auto',
        background: 'transparent',
        overflow: 'hidden',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        maxWidth: '100vw',
        maxHeight: '100vh',
      }}
    >
      {/* Grass background behind SVG */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: FIELD_WIDTH,
          height: FIELD_HEIGHT,
          zIndex: 0,
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
        width={FIELD_WIDTH}
        height={FIELD_HEIGHT}
        style={{
          background: 'transparent',
          borderRadius: 20,
          display: 'block',
          touchAction: 'none',
          transform: playerNumber === 2 ? 'rotate(180deg)' : 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 1,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Arrowhead marker for drag line */}
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth">
            <polygon points="0,0 8,4 0,8" fill="#ff0" />
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
          return (
            <line
              x1={ballPos.x}
              y1={ballPos.y}
              x2={ballPos.x + (dragStart.x - dragEnd.x) + wiggleX}
              y2={ballPos.y + (dragStart.y - dragEnd.y) + wiggleY}
              stroke={clutchActive ? 'orange' : '#ff0'}
              strokeWidth="4"
              markerEnd="url(#arrowhead)"
            />
          );
        })()}
      </svg>
      {/* Ball canvas overlay, mirrored for Player 2 */}
      {(() => {
        let canvasX = ballPos.x - BALL_RADIUS;
        let canvasY = ballPos.y - BALL_RADIUS;
        let transform = '';
        if (playerNumber === 2) {
          canvasX = FIELD_WIDTH - ballPos.x - BALL_RADIUS;
          canvasY = FIELD_HEIGHT - ballPos.y - BALL_RADIUS;
          transform = 'rotate(180deg)';
        }
        return (
          <canvas
            ref={ballCanvasRef}
            width={BALL_RADIUS * 2}
            height={BALL_RADIUS * 2}
            style={{
              position: 'absolute',
              left: canvasX,
              top: canvasY,
              width: BALL_RADIUS * 2,
              height: BALL_RADIUS * 2,
              pointerEvents: 'none',
              zIndex: 10,
              transform,
              transformOrigin: 'center',
            }}
          />
        );
      })()}
    </div>
  );
}

export default GameField; 