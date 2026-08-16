"use client";

import Image from "next/image";

export function CommunityTestimonials() {
  const testimonials = [
    {
      name: "Elise Rocksmith",
      role: "CEO @ Workers",
      quote:
        "The workout series is both inspiring and energizing. It's a unique blend of fitness and creativity.",
      avatar: "/api/attachments/XZj4-OZxQgcl8ZhkTJoSH",
      stars: "/api/attachments/td0Tv_fNaISn5Nw5B3Tqc",
    },
    {
      name: "Elise Rocksmith",
      role: "CEO @ Workers",
      quote:
        "The workout series is both inspiring and energizing. It's a unique blend of fitness and creativity.",
      avatar: "/api/attachments/3UBVPYwKJzKqUagw8HcfQ",
      stars: "/api/attachments/td0Tv_fNaISn5Nw5B3Tqc",
    },
  ];

  return (
    <section className="w-full bg-black py-16 lg:py-24">
      <div className="max-w-[1100px] mx-auto px-6">
        <h2 className="text-center text-white font-extrabold text-[32px] sm:text-[40px] leading-[49px] mb-16">
          Hear from Our Community
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {testimonials.map((item, idx) => (
            <div
              key={idx}
              className="relative bg-black border border-[#00a2ed]/30 rounded-[25px] p-6 sm:p-8 shadow-[0_4px_66px_rgba(193,193,193,0.15)] flex flex-col justify-between"
            >
              {/* Cyan Accent Backdrop / Speech Tail Vector */}
              <div className="absolute -bottom-3 right-8 w-10 h-10 bg-[#1597d4] clip-triangle pointer-events-none rounded-br-lg opacity-80" />

              {/* Top Row: Avatar + Info */}
              <div className="flex items-center gap-5 mb-6">
                <div className="relative w-[85px] h-[85px] sm:w-[100px] sm:h-[100px] rounded-full overflow-hidden border-[6px] border-[#1597d4] shrink-0">
                  <Image
                    src={item.avatar}
                    alt={item.name}
                    fill
                    className="object-cover"
                  />
                </div>

                <div className="flex flex-col">
                  <h3 className="text-white font-bold text-[18px] leading-[22px]">
                    {item.name}
                  </h3>
                  <p className="text-white font-semibold text-[12px] leading-[16px] opacity-80 mt-1">
                    {item.role}
                  </p>
                  {/* Stars */}
                  <div className="mt-2 w-[120px] h-[24px] relative">
                    <Image
                      src={item.stars}
                      alt="5 stars"
                      fill
                      className="object-contain object-left"
                    />
                  </div>
                </div>

                {/* Quote Icon SVG graphic */}
                <div className="ml-auto text-[#1597d4] opacity-80 hidden sm:block">
                  <svg
                    width="34"
                    height="22"
                    viewBox="0 0 34 22"
                    fill="currentColor"
                  >
                    <path d="M0 22V11C0 4.925 3.582 0 8 0V4.4C5.791 4.4 4 6.982 4 10.12V11H8V22H0ZM18 22V11C18 4.925 21.582 0 26 0V4.4C23.791 4.4 22 6.982 22 10.12V11H26V22H18Z" />
                  </svg>
                </div>
              </div>

              {/* Quote Text */}
              <p className="text-white font-light text-[14px] leading-[22px] sm:leading-[24px]">
                &ldquo;{item.quote}&rdquo;
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
