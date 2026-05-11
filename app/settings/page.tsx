"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { STAFF_LIST, ROLE_LABELS } from "@/lib/staffList";

export default function SettingsPage() {
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "manager") {
      router.replace("/orders");
    }
  }, [user, router]);

  if (!user || user.role !== "manager") return null;

  const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "Class A Jewellers";
  const storePhone = process.env.NEXT_PUBLIC_STORE_PHONE ?? "(08) 8344 7722";
  const storeEmail = process.env.NEXT_PUBLIC_STORE_EMAIL ?? "customercare@classa.com.au";
  const storeAddress = process.env.NEXT_PUBLIC_STORE_ADDRESS ?? "40 North East Road, Walkerville SA 5081";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Store Details */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-[#1B1F2E]">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Store Details</h2>
        </div>
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "Store Name", value: storeName },
            { label: "Phone", value: storePhone },
            { label: "Email", value: storeEmail },
            { label: "Address", value: storeAddress },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
              <p className="text-sm font-medium text-gray-800">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Staff List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-[#1B1F2E]">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Staff ({STAFF_LIST.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Name</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Role</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {STAFF_LIST.map((member) => (
                <tr key={member.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#A3B2A4] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {member.initials}
                    </div>
                    <span className="font-medium text-gray-800">{member.name}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                      member.role === "manager"
                        ? "bg-[#1B1F2E] text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{member.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* About */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">About</p>
        <p className="text-sm text-gray-700 font-medium">Class A Order System v1.0</p>
        <p className="text-xs text-gray-400 mt-1">Internal repair and order management system for Class A Jewellers</p>
      </div>
    </div>
  );
}
