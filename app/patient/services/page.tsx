'use client';

/**
 * Patient Services Hub — All appointment types + services
 * Features 366-371, 380
 */

import React from 'react';
import Link from 'next/link';
import {
    Stethoscope, Video, Package, FlaskConical, Syringe,
    Pill, Ambulance, Calendar, ArrowRight, Heart
} from 'lucide-react';

const SERVICES = [
    {
        id: 'consultation',
        title: 'Book Consultation',
        subtitle: 'Physical appointment with a doctor',
        icon: Stethoscope,
        color: 'bg-blue-500',
        light: 'bg-blue-50 border-blue-200',
        href: '/patient/appointments/book?type=consultation',
    },
    {
        id: 'video',
        title: 'Video Consultation',
        subtitle: 'Online teleconsultation from home',
        icon: Video,
        color: 'bg-purple-500',
        light: 'bg-purple-50 border-purple-200',
        href: '/patient/teleconsultation',
    },
    {
        id: 'packages',
        title: 'Health Packages',
        subtitle: 'Comprehensive health checkup packages',
        icon: Package,
        color: 'bg-emerald-500',
        light: 'bg-emerald-50 border-emerald-200',
        href: '/patient/appointments/book?type=package',
    },
    {
        id: 'diagnostics',
        title: 'Diagnostics',
        subtitle: 'Lab tests and diagnostic services',
        icon: FlaskConical,
        color: 'bg-amber-500',
        light: 'bg-amber-50 border-amber-200',
        href: '/patient/appointments/book?type=diagnostics',
    },
    {
        id: 'vaccination',
        title: 'Vaccination',
        subtitle: 'Book vaccination appointments',
        icon: Syringe,
        color: 'bg-teal-500',
        light: 'bg-teal-50 border-teal-200',
        href: '/patient/appointments/book?type=vaccination',
    },
    {
        id: 'medicines',
        title: 'Order Medicines',
        subtitle: 'Order prescribed medicines online',
        icon: Pill,
        color: 'bg-orange-500',
        light: 'bg-orange-50 border-orange-200',
        href: '/patient/medicines',
    },
    {
        id: 'ambulance',
        title: 'Request Ambulance',
        subtitle: 'Emergency ambulance service',
        icon: Ambulance,
        color: 'bg-red-500',
        light: 'bg-red-50 border-red-200',
        href: '/patient/ambulance',
    },
    {
        id: 'orders',
        title: 'My Orders',
        subtitle: 'View all orders and their status',
        icon: Calendar,
        color: 'bg-indigo-500',
        light: 'bg-indigo-50 border-indigo-200',
        href: '/patient/orders',
    },
];

export default function ServicesPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 pb-20">
            <div>
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                    <Heart className="h-6 w-6 text-emerald-500" /> Health Services
                </h2>
                <p className="text-sm text-gray-500 mt-1">Book appointments, order medicines, and more</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SERVICES.map(svc => {
                    const Icon = svc.icon;
                    return (
                        <Link key={svc.id} href={svc.href}
                            className={`flex items-center gap-4 p-5 rounded-2xl border-2 ${svc.light} hover:shadow-md transition-all group`}>
                            <div className={`w-12 h-12 ${svc.color} rounded-xl flex items-center justify-center shrink-0 shadow-sm`}>
                                <Icon className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-900 text-sm">{svc.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{svc.subtitle}</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 shrink-0" />
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
