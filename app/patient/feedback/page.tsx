'use client';

import React, { useState } from 'react';
import { MessageSquare, Star, SendHorizontal, ThumbsUp } from 'lucide-react';
import { submitPatientFeedback } from '@/app/actions/patient-actions';

export default function FeedbackPage() {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comments, setComments] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (rating === 0) {
            setError('Please select a star rating.');
            return;
        }
        setError('');
        setLoading(true);
        const res = await submitPatientFeedback(rating, comments);
        setLoading(false);
        if (res.success) {
            setSubmitted(true);
            setRating(0);
            setComments('');
        } else {
            setError(res.error || 'Failed to submit feedback.');
        }
    };

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
            <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-emerald-500" /> Rate Your Experience
            </h2>

            {submitted ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-10 text-center shadow-lg">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ThumbsUp className="h-10 w-10 text-emerald-600" />
                    </div>
                    <h3 className="text-3xl font-black text-gray-900 mb-2">Thank You!</h3>
                    <p className="text-gray-600 font-medium">Your feedback helps us provide better care.</p>
                    <button onClick={() => setSubmitted(false)} className="mt-8 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors">Submit Another</button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-8 border border-gray-200 shadow-xl relative overflow-hidden">
                    <div className="absolute -top-16 -right-16 w-32 h-32 bg-rose-50 rounded-full blur-2xl" />
                    <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-orange-50 rounded-full blur-2xl" />

                    <div className="relative z-10">
                        <div className="text-center mb-10">
                            <h3 className="text-3xl font-black text-gray-900 mb-2">How did we do?</h3>
                            <p className="text-gray-500 font-medium text-sm">Please rate your recent hospital experience.</p>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-6 text-sm text-red-700 font-medium text-center">
                                {error}
                            </div>
                        )}

                        <div className="flex justify-center gap-2 mb-10">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    onMouseEnter={() => setHover(star)}
                                    onMouseLeave={() => setHover(0)}
                                    className="p-1 focus:outline-none transition-transform hover:scale-110 active:scale-95"
                                >
                                    <Star
                                        className={`h-12 w-12 transition-colors ${
                                            star <= (hover || rating)
                                                ? 'fill-amber-400 text-amber-500 drop-shadow-md'
                                                : 'text-gray-200'
                                        }`}
                                    />
                                </button>
                            ))}
                        </div>

                        <div className="mb-8">
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Additional Comments (Optional)</label>
                            <textarea
                                value={comments}
                                onChange={(e) => setComments(e.target.value)}
                                placeholder="Tell us what you loved or what we can improve..."
                                className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 text-sm font-medium min-h-[120px] outline-none transition-colors"
                                maxLength={1000}
                            />
                        </div>

                        <button
                            disabled={loading || rating === 0}
                            type="submit"
                            className="w-full py-4 bg-gray-900 hover:bg-black text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            <SendHorizontal className="h-5 w-5" /> {loading ? 'Sending...' : 'Submit Feedback'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
