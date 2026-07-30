import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { callAdmin } from "@/lib/adminApi";
import AdminOverview from "@/components/admin/AdminOverview";
import AdminTraffic from "@/components/admin/AdminTraffic";
import AdminCustomers from "@/components/admin/AdminCustomers";
import AdminHealth from "@/components/admin/AdminHealth";
import AdminRevenue from "@/components/admin/AdminRevenue";

export default function Admin() {
  const { user, isLoadingAuth } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [keys, setKeys] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [timeRange, setTimeRange] = useState("30d");

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    (async () => {
      try {
        const [keyData, subData, planData] = await Promise.all([
          base44.entities.ApiKey.list("-created_date", 500),
          base44.entities.Subscription.list("-created_date", 500),
          base44.entities.Plan.list("sort_order", 100),
        ]);
        setKeys(keyData || []);
        setSubscriptions(subData || []);
        setPlans(planData || []);
      } catch (e) {}
    })();
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const now = new Date();
    let from = "";
    if (timeRange === "7d") from = new Date(now.getTime() - 7 * 86400000).toISOString();
    else if (timeRange === "30d") from = new Date(now.getTime() - 30 * 86400000).toISOString();
    (async () => {
      setStatsLoading(true);
      try {
        const statsResp = await callAdmin("adminStats", { from, to: "" });
        if (statsResp.ok) { setStats(statsResp.data); setStatsError(null); }
        else setStatsError(statsResp.message);
      } catch (e) { setStatsError(e.message); }
      finally { setStatsLoading(false); }
    })();
  }, [user, timeRange]);

  if (isLoadingAuth) return <div className="max-w-6xl mx-auto px-4 py-16 flex justify-center"><div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;
  if (!user || user.role !== "admin") return <Navigate to="/dashboard" replace />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight mb-6">Admin Panel</h1>
      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="traffic">Traffic</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><AdminOverview stats={stats} loading={statsLoading} error={statsError} keys={keys} subscriptions={subscriptions} plans={plans} /></TabsContent>
        <TabsContent value="traffic"><AdminTraffic stats={stats} loading={statsLoading} error={statsError} timeRange={timeRange} onTimeRangeChange={setTimeRange} /></TabsContent>
        <TabsContent value="customers"><AdminCustomers stats={stats} keys={keys} plans={plans} loading={statsLoading} /></TabsContent>
        <TabsContent value="health"><AdminHealth stats={stats} loading={statsLoading} error={statsError} /></TabsContent>
        <TabsContent value="revenue"><AdminRevenue stats={stats} subscriptions={subscriptions} plans={plans} loading={statsLoading} /></TabsContent>
      </Tabs>
    </div>
  );
}