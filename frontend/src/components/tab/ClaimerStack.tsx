import React from 'react';
import { Avatar } from '../ui';
import type { TabParticipant } from '../../types/tab';

export interface ClaimerStackProps {
    participants: TabParticipant[];
    /** The viewer, drawn in the accent tone so they find themselves quickly. */
    currentParticipantId?: number | null;
    max?: number;
    size?: number;
}

/**
 * Overlapping avatars for whoever is on a line, with a "+N" chip once the
 * stack would get unreadable.
 */
const ClaimerStack: React.FC<ClaimerStackProps> = ({
    participants,
    currentParticipantId,
    max = 3,
    size = 23,
}) => {
    if (participants.length === 0) return null;

    const shown = participants.slice(0, max);
    const overflow = participants.length - shown.length;

    return (
        <div className="flex flex-none">
            {shown.map((participant, index) => (
                <div
                    key={participant.id}
                    style={{ marginLeft: index === 0 ? 0 : -7 }}
                    // The ring separates overlapping circles from each other.
                    className="rounded-full ring-2 ring-sw-surface"
                >
                    <Avatar
                        name={participant.display_name}
                        size={size}
                        variant={
                            participant.id === currentParticipantId ? 'accent' : 'neutral'
                        }
                    />
                </div>
            ))}
            {overflow > 0 && (
                <div
                    style={{ marginLeft: -7, width: size, height: size }}
                    className="rounded-full ring-2 ring-sw-surface bg-sw-raise text-sw-muted flex items-center justify-center text-[8px] font-semibold flex-none"
                >
                    +{overflow}
                </div>
            )}
        </div>
    );
};

export default ClaimerStack;
