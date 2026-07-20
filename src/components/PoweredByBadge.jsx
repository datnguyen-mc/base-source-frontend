import { useRef } from 'react';
import { useAuth } from '@/lib/useAuth';
import { motion } from 'framer-motion';

const PoweredByBadge = () => {
    const { projectInfo } = useAuth();
    const constraintsRef = useRef(null);
    const dragStarted = useRef(false);

    if (!projectInfo?.data?.package?.isFree) {
        return null;
    }

    return (
        <div
            ref={constraintsRef}
            className="fixed inset-0 pointer-events-none z-[9999]"
        >
            <motion.a
                href="https://vibe-x.app"
                target="_blank"
                rel="noopener noreferrer"
                drag
                dragConstraints={constraintsRef}
                dragMomentum={false}
                dragElastic={0}
                onDragStart={() => {
                    dragStarted.current = true;
                }}
                onDragEnd={() => {
                    setTimeout(() => {
                        dragStarted.current = false;
                    }, 50);
                }}
                onClick={(e) => {
                    if (dragStarted.current) {
                        e.preventDefault();
                    }
                }}
                whileDrag={{ scale: 1.05, cursor: 'grabbing' }}
                className="pointer-events-auto absolute bottom-4 right-4 bg-black/75 text-white px-[14px] py-[6px] rounded-full text-xs font-semibold no-underline backdrop-blur flex items-center gap-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.3)] cursor-grab touch-none"
            >
                ⚡ Powered by vibeX
            </motion.a>
        </div>
    );
};

export default PoweredByBadge;
