"use client";

import Image from "next/image";

export function Hero() {
  return (
    <section className="relative w-full bg-black overflow-hidden py-12 lg:py-20">
      {/* Background dark texture overlays */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-screen pointer-events-none"
        style={{
          backgroundImage: `url('/api/attachments/9V71pWvZm5Jf8yGffXZkg')`,
        }}
      />
      <div
        className="absolute left-0 top-0 w-full lg:w-1/2 h-full bg-cover bg-left opacity-30 pointer-events-none"
        style={{
          backgroundImage: `url('/api/attachments/FKzmVaw70GJX3mdnfqK8y')`,
        }}
      />

      <div className="relative max-w-[1440px] mx-auto px-6 lg:px-[120px]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-h-[550px]">
          {/* Left Hero Text Column */}
          <div className="lg:col-span-7 flex flex-col justify-center items-start space-y-6 z-10">
            <h1 className="text-white text-[36px] sm:text-[42px] lg:text-[50px] leading-[1.2] lg:leading-[65px] font-semibold max-w-[615px]">
              Unlock Your Potential with Elite Mentorship
            </h1>

            <p className="text-[#c1c1c1] text-[18px] sm:text-[20px] lg:text-[22px] leading-[28px] lg:leading-[30px] font-light max-w-[582px]">
              Transform your life through fitness, art, and entrepreneurial
              success with guidance from the best in the field.
            </p>

            <div className="pt-2">
              <a
                href="#contact"
                className="inline-flex items-center justify-center w-[166px] h-[50px] bg-[#00a2ed] hover:bg-[#1597d4] text-white font-semibold text-[15px] leading-[18px] tracking-wide rounded-sm transition-all duration-200 shadow-md hover:shadow-[#00a2ed]/30"
              >
                Work With Me
              </a>
            </div>
          </div>

          {/* Right Hero Image Column */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end relative">
            <div className="relative w-[280px] sm:w-[309px] h-[480px] sm:h-[534px] rounded-lg overflow-hidden border border-[#00a2ed]/20 shadow-2xl bg-black">
              <Image
                src="/api/attachments/CZnI9Y6UOYo_2NFhDkdUL"
                alt="Shane Hall"
                fill
                priority
                className="object-cover object-center"
                sizes="(max-width: 768px) 280px, 309px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
