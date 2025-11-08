import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, Info, Users, PenTool, Ticket, Menu, X, Store } from "lucide-react";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const navigationItems = [
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-blue-600 shadow-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}

            {/* Desktop Navigation */}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-white hover:text-yellow-300"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {isMobileMenuOpen && (
            <nav className="md:hidden py-4 border-t border-blue-500">
              {navigationItems.map((item) => (
                <Link
                  key={item.title}
                  to={item.url}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center px-4 py-3 transition-all font-bold ${
                    location.pathname === item.url
                      ? "bg-yellow-400 text-blue-900"
                      : "text-white hover:bg-blue-500"
                  }`}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.title}
                </Link>
              ))}
              <a
                href="https://booking.naver.com/booking/12/bizes/931159"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center px-4 py-3 bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-900 font-black hover:from-yellow-500 hover:to-yellow-600 transition-all mt-2"
              >
                <Ticket className="w-5 h-5 mr-3" />
                예매하기
              </a>
            </nav>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative">{children}</main>

      {/* Footer */}
      <footer className="bg-blue-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-3 gap-8">

          </div>
          <div className="mt-8 pt-8 border-t border-blue-800 text-center text-blue-300 text-sm font-semibold">
            © 2025 All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
