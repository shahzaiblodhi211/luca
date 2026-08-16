"use client";

import Image from "next/image";

export function ElevateJourney() {
  const topServices = [
    {
      title: "Transform Your Marketing Skills",
      desc: "Join our mentorship program to master the art of marketing, enhance your sales techniques, and design a life you love.",
      buttonText: "Learn More",
      icon: "/api/attachments/RYzd_U5iPZN-r_-JSghZr",
      iconWidth: 87,
      iconHeight: 87,
    },
    {
      title: "Exel In The Solar Industry",
      desc: "Leverage our strategies to thrive in the solar business. Achieve milestones like $100K in earnings and $325K in just five months.",
      buttonText: "Get Started",
      icon: "/api/attachments/TVxLnsO7_uR1YXFbDqfGL",
      iconWidth: 79,
      iconHeight: 79,
    },
    {
      title: "Boost Your Brand Visibility",
      desc: "Schedule a free 30-minute consultation to discover how we can elevate your brand through expert media and marketing services.",
      buttonText: "Book Now",
      icon: "/api/attachments/czrSDmffDVA-D8EkDyJvv",
      iconWidth: 77,
      iconHeight: 77,
    },
  ];

  const bottomServices = [
    {
      title: "Train With Top Athletes",
      desc: "Join our YouTube series where fitness meets creativity. Workout with elite athletes while live artwork is created.",
      buttonText: "Get Started",
      icon: "/api/attachments/_n-K8Um7tkTH0OdsTadWI",
      iconWidth: 63,
      iconHeight: 63,
    },
    {
      title: "Explore Our Unique Collection",
      desc: "Browse our exclusive art and merchandise designed to inspire and motivate you.",
      buttonText: "Get Started",
      icon: "/api/attachments/lU0_hN_4S5TB2nx426nr2",
      iconWidth: 64,
      iconHeight: 64,
    },
  ];

  return (
    <section id="services" className="w-full bg-black py-16 lg:py-24">
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-center text-white font-bold text-[32px] sm:text-[40px] leading-[50px] mb-16">
          Elevate Your Journey
        </h2>

        {/* Top Row: 3 Services */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 relative pb-12 border-b border-[#00a2ed]/30">
          {topServices.map((service, index) => (
            <div
              key={index}
              className="flex flex-col items-center text-center space-y-4 px-4 py-6 hover:bg-white/[0.02] rounded-xl transition-all duration-200"
            >
              <div className="h-[90px] flex items-center justify-center">
                <Image
                  src={service.icon}
                  alt={service.title}
                  width={service.iconWidth}
                  height={service.iconHeight}
                  className="object-contain"
                />
              </div>

              <h3 className="text-white font-extrabold text-[20px] leading-[30px] min-h-[60px] flex items-center justify-center">
                {service.title}
              </h3>

              <p className="text-white/90 font-light text-[14px] leading-[19px] max-w-[339px] min-h-[57px]">
                {service.desc}
              </p>

              <div className="pt-4">
                <button className="w-[114px] h-[34px] bg-[#00a2ed] hover:bg-[#1597d4] text-white font-semibold text-[12px] leading-[15px] rounded-[8px] transition-colors">
                  {service.buttonText}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Row: 2 Services */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-16 max-w-[900px] mx-auto pt-12">
          {bottomServices.map((service, index) => (
            <div
              key={index}
              className="flex flex-col items-center text-center space-y-4 px-4 py-6 hover:bg-white/[0.02] rounded-xl transition-all duration-200"
            >
              <div className="h-[80px] flex items-center justify-center">
                <Image
                  src={service.icon}
                  alt={service.title}
                  width={service.iconWidth}
                  height={service.iconHeight}
                  className="object-contain"
                />
              </div>

              <h3 className="text-white font-extrabold text-[20px] leading-[30px] min-h-[30px]">
                {service.title}
              </h3>

              <p className="text-white/90 font-light text-[14px] leading-[19px] max-w-[339px] min-h-[40px]">
                {service.desc}
              </p>

              <div className="pt-4">
                <button className="w-[114px] h-[34px] bg-[#00a2ed] hover:bg-[#1597d4] text-white font-semibold text-[12px] leading-[15px] rounded-[8px] transition-colors">
                  {service.buttonText}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
