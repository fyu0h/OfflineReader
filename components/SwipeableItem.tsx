import React, { useState, useRef, useEffect } from 'react';

interface SwipeableItemProps {
    children: React.ReactNode;
    onDelete: () => void;
    height?: number; // Optional fixed height to ensure layout stability
    className?: string;
    onClick?: () => void;
}

const SwipeableItem: React.FC<SwipeableItemProps> = ({
    children,
    onDelete,
    className = '',
    onClick,
}) => {
    const [offset, setOffset] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const startX = useRef<number | null>(null);
    const currentOffset = useRef(0);
    const DELETE_WIDTH = 80; // Width of the delete button area

    const handleTouchStart = (e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
        setIsSwiping(false); // Reset swiping flag
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (startX.current === null) return;
        const x = e.touches[0].clientX;
        const delta = x - startX.current;

        // Only consider it a swipe if horizontal movement is significant
        if (Math.abs(delta) > 5) {
            setIsSwiping(true);
            // Calculate new offset based on previous state (0 or -DELETE_WIDTH)
            // Limit swipe to the left (negative values)
            let newOffset = currentOffset.current + delta;

            // Resistance/Clamping
            if (newOffset > 0) newOffset = 0; // Can't swipe right
            if (newOffset < -DELETE_WIDTH * 1.5) newOffset = -DELETE_WIDTH * 1.5; // Max swipe left limit

            setOffset(newOffset);
        }
    };

    const handleTouchEnd = () => {
        if (startX.current === null) return;

        let targetOffset = 0;
        // If swiped more than half way, snap open
        if (offset < -DELETE_WIDTH / 2) {
            targetOffset = -DELETE_WIDTH;
        } else {
            targetOffset = 0;
        }

        setOffset(targetOffset);
        currentOffset.current = targetOffset;
        startX.current = null;

        // Slight delay to reset swiping flag so onClick doesn't fire immediately if it was a swipe
        setTimeout(() => setIsSwiping(false), 100);
    };

    // Close swipe if clicking outside (optional, but good UX)
    // For simplicity, we just rely on explicit touch interactions for now.
    // One improvement: if offset is open, clicking it should close it?
    const handleClick = (e: React.MouseEvent) => {
        if (currentOffset.current !== 0) {
            // If open, close it
            setOffset(0);
            currentOffset.current = 0;
            e.stopPropagation();
            return;
        }
        // Only trigger onClick if not swiping
        if (!isSwiping && onClick) {
            onClick();
        }
    };

    return (
        <div className={`relative overflow-hidden ${className}`}>
            {/* Background Actions Layer */}
            <div className="absolute inset-y-0 right-0 w-[80px] bg-red-500 flex items-center justify-center z-0">
                <button
                    className="w-full h-full flex items-center justify-center text-white"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                        // Reset state
                        setOffset(0);
                        currentOffset.current = 0;
                    }}
                >
                    <span className="material-symbols-outlined text-2xl">delete</span>
                </button>
            </div>

            {/* Foreground Content Layer */}
            <div
                className="relative bg-white dark:bg-[#101622] z-10 transition-transform duration-300 ease-out"
                style={{ transform: `translateX(${offset}px)` }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={handleClick}
            >
                {children}
            </div>
        </div>
    );
};

export default SwipeableItem;
