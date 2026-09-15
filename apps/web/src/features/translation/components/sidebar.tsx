'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import {
    LayoutDashboard,
    Languages,
    History,
    LayoutTemplate,
    Settings,
    HelpCircle,
    LogOut,
    Sparkles
} from 'lucide-react'

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Translate Document', href: '/translate', icon: Languages },
    { name: 'History', href: '/translate/history', icon: History },
    { name: 'Templates', href: '/translate/templates', icon: LayoutTemplate },
    { name: 'Settings', href: '/translate/settings', icon: Settings },
]

export function Sidebar() {
    const pathname = usePathname()

    return (
        <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
            <div className="flex h-16 items-center gap-2 px-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                    <Sparkles className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="font-bold text-slate-900">Starlink</h1>
                    <p className="text-[10px] text-slate-500">Cross-Cultural Assistant</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
                <nav className="space-y-1">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href
                        return (
                            <Link
                                key={item.name}
                                href={item.href as Route}
                                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                                        ? 'bg-blue-50 text-blue-600'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                <item.icon
                                    className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-500'
                                        }`}
                                />
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            <div className="border-t border-slate-200 p-3">
                <nav className="space-y-1">
                    <Link
                        href={'/community' as Route}
                        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                        <HelpCircle className="h-5 w-5 text-slate-400 group-hover:text-slate-500" />
                        Help
                    </Link>
                    <button
                        className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                        <LogOut className="h-5 w-5 text-slate-400 group-hover:text-slate-500" />
                        Log out
                    </button>
                </nav>
            </div>
        </div>
    )
}
