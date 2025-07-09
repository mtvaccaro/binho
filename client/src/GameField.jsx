import React, { useRef, useEffect } from 'react';
import fieldTexture from './assets/field.png';

const SOCCER_BALL_IMG = 'https://assets.bwbx.io/images/users/iqjWHBFdfxIU/i7j7kIBS2BF8/v0/-1x-1.webp';

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
  handleTouchEnd,
  svgRef,
  ballAngle = 0, // new prop for rotation
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
      // Clip to circle
      ctx.beginPath();
      ctx.arc(0, 0, BALL_RADIUS, 0, 2 * Math.PI);
      ctx.closePath();
      ctx.clip();
      // Draw image centered
      ctx.drawImage(img, -BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);
      ctx.restore();
    };
  }, [ballPos.x, ballPos.y, ballAngle, BALL_RADIUS]);
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Grass background behind SVG */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
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
        width="100%"
        height="100%"
        style={{ background: 'transparent', borderRadius: 20, display: 'block', touchAction: 'none', transform: playerNumber === 2 ? 'rotate(180deg)' : 'none', position: 'relative', zIndex: 1 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
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
        {dragging && dragStart && dragEnd && (
          <line
            x1={ballPos.x}
            y1={ballPos.y}
            x2={ballPos.x + (dragStart.x - dragEnd.x)}
            y2={ballPos.y + (dragStart.y - dragEnd.y)}
            stroke="#ff0"
            strokeWidth="4"
            markerEnd="url(#arrowhead)"
          />
        )}
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