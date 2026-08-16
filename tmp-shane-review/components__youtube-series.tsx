"use client";

import Image from "next/image";
import { Bell } from "lucide-react";

export function YoutubeSeries() {
  return (
    <section id="podcast" className="w-full bg-black py-16 lg:py-24">
      <div className="max-w-[1280px] mx-auto px-6">
        {/* Header */}
        <div className="text-center max-w-[887px] mx-auto space-y-4 mb-14">
          <h2 className="text-white font-extrabold text-[32px] sm:text-[45px] leading-[42px] sm:leading-[55px]">
            Goated YouTube Series
          </h2>
          <p className="text-[#ebebeb] font-normal text-[16px] sm:text-[22px] leading-[26px] sm:leading-[30px]">
            Dive into our &apos;Goated&apos; series, where we collaborate with top
            athletes and artists. Watch, learn, and get inspired by our unique
            blend of fitness, art, and motivational content.
          </p>
        </div>

        {/* Video Cards Grid */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-6 mb-20">
          {/* Left Thumbnail Video */}
          <div className="relative w-full sm:w-[204px] h-[350px] sm:h-[393px] rounded-xl overflow-hidden border border-white/10 shrink-0">
            <Image
              src="/api/attachments/FKzmVaw70GJX3mdnfqK8y"
              alt="YouTube Video Preview Left"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/30 hover:bg-black/10 transition-colors" />
          </div>

          {/* Center Main Featured Player */}
          <div className="relative w-full lg:w-[701px] h-[300px] sm:h-[393px] rounded-[15px] overflow-hidden border border-[#00a2ed]/40 shadow-2xl shrink-0 group cursor-pointer">
            <Image
              src="/api/attachments/9V71pWvZm5Jf8yGffXZkg"
              alt="Shane Hall Featured YouTube Video"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />

            {/* Red Play Button Overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[81px] h-[57px] bg-[#ff0000] rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg
                  width="21"
                  height="24"
                  viewBox="0 0 21 24"
                  fill="white"
                >
                  <path d="M21 12L0 24V0L21 12Z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Right Thumbnail Video */}
          <div className="relative w-full sm:w-[204px] h-[350px] sm:h-[393px] rounded-xl overflow-hidden border border-white/10 shrink-0">
            <Image
              src="/api/attachments/C-JI9QJ_3oG7TkbwN8slM"
              alt="YouTube Video Preview Right"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/30 hover:bg-black/10 transition-colors" />
          </div>
        </div>

        {/* Subscribe Banner Card */}
        <div className="w-full bg-black border border-[#00a2ed] rounded-2xl p-8 lg:p-12 flex flex-col lg:flex-row items-center justify-between gap-8 shadow-2xl">
          <div className="space-y-3 text-center lg:text-left">
            <h3 className="text-white font-bold text-[28px] sm:text-[40px] leading-[36px] sm:leading-[49px]">
              Subscribe to Our{" "}
              <span className="text-[#ff0000]">YouTube</span> Channel Now
            </h3>
            <p className="text-white font-normal text-[16px] sm:text-[20px] leading-[24px]">
              Get Motivated always, connect with us on{" "}
              <span className="text-red-500 font-semibold">YouTube</span>
            </p>
          </div>

          {/* Subscribe Red Action Button */}
          <a
            href="https://youtube.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-[#ff0000] hover:bg-red-700 text-white px-8 py-4 rounded-[12px] font-bold text-[20px] sm:text-[24px] leading-[34px] shadow-lg transition-transform hover:scale-105 shrink-0"
          >
            {/* YouTube Icon */}
            <svg width="36" height="26" viewBox="0 0 53 36" fill="currentColor">
              <rect width="53" height="36" rx="8" fill="white" />
              <path d="M35 18L21 25.5V10.5L35 18Z" fill="#FF0000" />
            </svg>
            <span>Subscribe</span>
            <Bell className="w-6 h-6 fill-white text-white ml-2" />
          </a>
        </div>
      </div>
    </section>
  );
}
