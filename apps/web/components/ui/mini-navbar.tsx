"use client";

import React, { useState, useEffect, useRef } from "react";

const AnimatedNavLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <a
    href={href}
    className="group relative block overflow-hidden text-sm leading-5"
    style={{ height: "20px" }}
  >
    <div className="flex flex-col transition-transform duration-300 ease-out group-hover:-translate-y-1/2">
      <span className="block h-5 leading-5 text-gray-300">{children}</span>
      <span className="block h-5 leading-5 text-white">{children}</span>
    </div>
  </a>
);

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [headerShapeClass, setHeaderShapeClass] = useState("rounded-full");
  const shapeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (shapeTimeoutRef.current) clearTimeout(shapeTimeoutRef.current);
    if (isOpen) {
      setHeaderShapeClass("rounded-xl");
    } else {
      shapeTimeoutRef.current = setTimeout(
        () => setHeaderShapeClass("rounded-full"),
        300
      );
    }
    return () => {
      if (shapeTimeoutRef.current) clearTimeout(shapeTimeoutRef.current);
    };
  }, [isOpen]);

  const navLinksData = [
    { label: "产品", href: "#product" },
    { label: "特性", href: "#features" },
    { label: "对比", href: "#compare" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header
      className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-20
        flex flex-col items-center pl-6 pr-6 py-3 backdrop-blur-sm
        ${headerShapeClass}
        border border-[#333] bg-[#1f1f1f57]
        w-[calc(100%-2rem)] sm:w-auto
        transition-[border-radius] duration-0 ease-in-out`}
    >
      <div className="flex items-center justify-between w-full gap-x-6 sm:gap-x-8">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2">
          <svg viewBox="0 0 14 26" fill="none" className="w-4 h-6">
            <path fill="#E04E2A" d="M 7 0 C 10 5.5, 14 12, 14 17.5 C 14 21.5, 11 25, 7 26 C 3 25, 0 21.5, 0 17.5 C 0 12, 4 5.5, 7 0 Z"/>
            <path fill="#FFFFFF" d="M 7 10 C 8 12.5, 9.4 14.2, 9.4 16.5 C 9.4 18.2, 8.4 19.5, 7 20 C 5.6 19.5, 4.6 18.2, 4.6 16.5 C 4.6 14.2, 6 12.5, 7 10 Z"/>
          </svg>
          <span className="text-white font-bold text-sm tracking-tight">
            ASpark
          </span>
        </a>

        <nav className="hidden sm:flex items-center space-x-4 sm:space-x-6 text-sm">
          {navLinksData.map((link) => (
            <AnimatedNavLink key={link.href} href={link.href}>
              {link.label}
            </AnimatedNavLink>
          ))}
        </nav>

        <div className="hidden sm:flex items-center gap-2 sm:gap-3">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm border border-[#333] bg-[rgba(31,31,31,0.62)] text-gray-300 rounded-full hover:border-white/50 hover:text-white transition-colors duration-200"
          >
            GitHub
          </a>
          <div className="relative group">
            <div className="absolute inset-0 -m-2 rounded-full hidden sm:block bg-brand/40 opacity-40 filter blur-lg pointer-events-none transition-all duration-300 ease-out group-hover:opacity-60 group-hover:blur-xl group-hover:-m-3" />
            <a
              href="/login"
              className="relative z-10 px-4 py-2 text-sm font-semibold text-white bg-brand hover:bg-brand-light rounded-full transition-all duration-200"
            >
              开始构建
            </a>
          </div>
        </div>

        <button
          className="sm:hidden flex items-center justify-center w-8 h-8 text-gray-300 focus:outline-none"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "关闭菜单" : "打开菜单"}
        >
          {isOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      <div
        className={`sm:hidden flex flex-col items-center w-full transition-all ease-in-out duration-300 overflow-hidden ${
          isOpen
            ? "max-h-[1000px] opacity-100 pt-4"
            : "max-h-0 opacity-0 pt-0 pointer-events-none"
        }`}
      >
        <nav className="flex flex-col items-center space-y-4 text-base w-full">
          {navLinksData.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-gray-300 hover:text-white transition-colors w-full text-center"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex flex-col items-center space-y-4 mt-4 w-full">
          <a
            href="/login"
            className="px-4 py-2 text-sm font-semibold text-white bg-brand rounded-full w-full text-center"
          >
            开始构建
          </a>
        </div>
      </div>
    </header>
  );
}
