import React from 'react';

export interface PageHeaderProps {
    title: React.ReactNode;
    /** Supporting line — sits beside the title on desktop, beneath on mobile. */
    caption?: React.ReactNode;
    /** Toggles and actions, right-aligned. */
    actions?: React.ReactNode;
    /** Adds top padding to clear the mobile status bar. */
    mobileInset?: boolean;
}

/**
 * The bar at the top of every workspace pane: title, a quiet caption, and the
 * screen's actions.
 */
const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    caption,
    actions,
    mobileInset = false,
}) => (
    <div
        className={`flex items-center gap-3.5 px-4 lg:px-[22px] py-4 border-b border-sw-line flex-none ${
            mobileInset ? 'pt-[max(1rem,env(safe-area-inset-top))] lg:pt-4' : ''
        }`}
    >
        <div className="min-w-0">
            <div className="text-[19px] font-medium truncate">{title}</div>
            {caption && (
                <div className="text-[12.5px] text-sw-dim lg:hidden truncate">
                    {caption}
                </div>
            )}
        </div>
        {caption && (
            <div className="text-[12.5px] text-sw-dim hidden lg:block truncate">
                {caption}
            </div>
        )}
        {actions && (
            <div className="ml-auto flex items-center gap-2 flex-none">{actions}</div>
        )}
    </div>
);

export default PageHeader;
