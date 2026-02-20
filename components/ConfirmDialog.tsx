import React from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    message,
    confirmText = '确定',
    cancelText = '取消',
    onConfirm,
    onCancel,
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in" style={{ margin: 0, bottom: 0 }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-all" onClick={onCancel}></div>
            <div className="relative bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl w-full max-w-[280px] overflow-hidden animate-scale-in">
                <div className="p-6 text-center">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{message}</p>
                </div>
                <div className="flex border-t border-slate-100 dark:border-slate-700/50">
                    <button
                        className="flex-1 py-3.5 text-base font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors active:bg-slate-100 dark:active:bg-slate-700/50"
                        onClick={onCancel}
                    >
                        {cancelText}
                    </button>
                    <div className="w-[1px] bg-slate-100 dark:bg-slate-700/50"></div>
                    <button
                        className="flex-1 py-3.5 text-base font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors active:bg-red-50 dark:active:bg-red-900/20"
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmDialog;
