"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Row from "./row";
import { getPasswordsByUserId } from "@/actions/password.actions";
import { isAuthenticated } from "@/actions/auth.actions";

export function VaultTable({ showMoreInfo }) {
  const { data: userId } = useQuery({
    queryKey: ["user"],
    queryFn: isAuthenticated,
  });

  const { data: credentials = [], isLoading } = useQuery({
    queryKey: ["passwords", userId],
    queryFn: () => getPasswordsByUserId(userId),
    enabled: !!userId,
  });

  if (isLoading) return <p>Loading...</p>;

  return (
    <Table className="max-h-full">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px] text-white">Source</TableHead>
          <TableHead className="text-white">Password</TableHead>
          {showMoreInfo && (
            <TableHead className="text-white text-center">Strength</TableHead>
          )}
          <TableHead className="text-white">Notes</TableHead>
          <TableHead className="text-white">Created</TableHead>
          <TableHead className="text-white">Updated</TableHead>
          <TableHead className="text-right text-white">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="max-h-full overflow-auto">
        {credentials.map((password, index) => (
          <Row
            showMoreInfo={showMoreInfo}
            password={password}
            key={password.source + index}
          />
        ))}
      </TableBody>
    </Table>
  );
}
