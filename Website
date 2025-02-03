import React, { useEffect, useState } from "react";
import { Table, TableHead, TableRow, TableCell, TableBody, Input } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";

const API_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQV0Qjm7k6EaeIvyvEKbLoti-F_abvF3D4iVNrzXGxSXFPRkbHghwueDWz7IjG-SnzOSGX8qIjRorjQ/pub?gid=1972655678&single=true&output=csv";

const BlockchainDashboard = () => {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(API_URL);
      const text = await response.text();
      const rows = text.split("\n").map(row => row.split(","));
      const headers = rows.shift();
      const formattedData = rows.map(row => Object.fromEntries(row.map((cell, i) => [headers[i], cell])));
      setData(formattedData);
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortConfig.key) return 0;
    if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === "asc" ? -1 : 1;
    if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const filteredData = sortedData.filter(row =>
    Object.values(row).some(value => value.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-4 bg-gray-900 text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Blockchain Analytics Dashboard</h1>
      <Input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 p-2 w-full bg-gray-800 text-white"
      />
      <Table>
        <TableHead>
          <TableRow>
            {data.length > 0 &&
              Object.keys(data[0]).map((key) => (
                <TableCell key={key} className="cursor-pointer" onClick={() => handleSort(key)}>
                  {key} <ArrowUpDown className="inline w-4 h-4" />
                </TableCell>
              ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredData.map((row, index) => (
            <TableRow key={index}>
              {Object.values(row).map((cell, i) => (
                <TableCell key={i}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default BlockchainDashboard;
